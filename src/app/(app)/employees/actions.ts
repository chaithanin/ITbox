"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { linkEmployeesToUsers } from "@/lib/hr-user-link";

const employeeSchema = z.object({
  employeeCode: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
  position: z.string().max(200).optional(),
  departmentId: z.uuid().optional().or(z.literal("")),
  locationId: z.uuid().optional().or(z.literal("")),
  managerId: z.uuid().optional().or(z.literal("")),
  status: z.enum(["ACTIVE", "ON_LEAVE", "OFFBOARDING", "RESIGNED"]).default("ACTIVE"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  simCardId: z.uuid().optional().or(z.literal("")),
});

type EmployeeInput = z.infer<typeof employeeSchema>;

const nul = (v: string | undefined) => (v ? v : null);
const nulDate = (v: string | undefined) => (v ? new Date(v) : null);

/** Ensure referenced department/location/manager belong to the user's org. */
async function assertOrgRefs(user: CurrentUser, input: EmployeeInput, selfId?: string) {
  const organizationId = user.organizationId;
  if (input.departmentId) {
    const d = await prisma.department.findFirst({
      where: { id: input.departmentId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!d) throw new Error("Invalid department");
  }
  if (input.locationId) {
    const l = await prisma.location.findFirst({
      where: { id: input.locationId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!l) throw new Error("Invalid location");
  }
  if (input.managerId) {
    if (selfId && input.managerId === selfId) throw new Error("Employee cannot be their own manager");
    const m = await prisma.employee.findFirst({
      where: { id: input.managerId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!m) throw new Error("Invalid manager");
  }
}

/**
 * Link a SIM/phone line to an employee (and unlink any others they held).
 * Only free SIMs (unassigned) or the employee's own may be linked. No-op unless
 * the actor may manage SIMs.
 */
async function applySimLink(user: CurrentUser, employeeId: string, simCardId: string | null | undefined) {
  if (!user.permissions.has("sim:manage")) return;
  const orgId = user.organizationId;
  const targetId = simCardId || null;
  const current = await prisma.simCard.findMany({
    where: { organizationId: orgId, employeeId, deletedAt: null }, select: { id: true },
  });
  for (const s of current) {
    if (s.id !== targetId) await prisma.simCard.update({ where: { id: s.id }, data: { employeeId: null } });
  }
  if (targetId) {
    const sim = await prisma.simCard.findFirst({
      where: { id: targetId, organizationId: orgId, deletedAt: null }, select: { id: true, employeeId: true },
    });
    if (sim && (sim.employeeId === null || sim.employeeId === employeeId)) {
      await prisma.simCard.update({ where: { id: targetId }, data: { employeeId, status: "ACTIVE" } });
    }
  }
}

function toData(input: EmployeeInput) {
  return {
    employeeCode: input.employeeCode,
    firstName: input.firstName,
    lastName: input.lastName,
    email: nul(input.email),
    phone: nul(input.phone),
    position: nul(input.position),
    departmentId: nul(input.departmentId),
    locationId: nul(input.locationId),
    managerId: nul(input.managerId),
    status: input.status,
    startDate: nulDate(input.startDate),
    endDate: nulDate(input.endDate),
  };
}

export async function createEmployee(formData: FormData) {
  const user = await requirePermission("employee:create");
  const input = employeeSchema.parse(Object.fromEntries(formData));
  await assertOrgRefs(user, input);

  const dup = await prisma.employee.findFirst({
    where: { organizationId: user.organizationId, employeeCode: input.employeeCode, deletedAt: null },
    select: { id: true },
  });
  if (dup) throw new Error("Employee code already exists");

  const row = await prisma.employee.create({
    data: { ...toData(input), organizationId: user.organizationId },
  });
  await applySimLink(user, row.id, input.simCardId);
  await auditLog(user, {
    action: "CREATE",
    entityType: "EMPLOYEE",
    entityId: row.id,
    detail: { employeeCode: row.employeeCode, name: `${row.firstName} ${row.lastName}` },
  });
  revalidatePath("/employees");
  redirect(`/employees/${row.id}`);
}

export async function updateEmployee(formData: FormData) {
  const user = await requirePermission("employee:update");
  const id = z.uuid().parse(formData.get("id"));
  const input = employeeSchema.parse(Object.fromEntries(formData));

  const existing = await prisma.employee.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, departmentId: true, position: true, firstName: true, lastName: true },
  });
  if (!existing) throw new Error("Employee not found");
  await assertOrgRefs(user, input, id);

  const dup = await prisma.employee.findFirst({
    where: {
      organizationId: user.organizationId,
      employeeCode: input.employeeCode,
      deletedAt: null,
      NOT: { id },
    },
    select: { id: true },
  });
  if (dup) throw new Error("Employee code already exists");

  const row = await prisma.employee.update({ where: { id }, data: toData(input) });
  await applySimLink(user, row.id, input.simCardId);
  await auditLog(user, {
    action: "UPDATE",
    entityType: "EMPLOYEE",
    entityId: row.id,
    detail: { employeeCode: row.employeeCode, name: `${row.firstName} ${row.lastName}` },
  });

  // Mover control: a department or position change should trigger an access
  // review — notify IT managers/admins and leave an audit trail so held assets,
  // licenses, and system access are re-certified for the new role.
  const deptChanged = (existing.departmentId ?? null) !== (row.departmentId ?? null);
  const posChanged = (existing.position ?? null) !== (row.position ?? null);
  if (deptChanged || posChanged) {
    const managers = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId, deletedAt: null, status: "ACTIVE",
        userRoles: { some: { role: { key: { in: ["SUPER_ADMIN", "ADMIN", "IT_MANAGER"] } } } },
      },
      select: { id: true },
    });
    if (managers.length > 0) {
      const what = [deptChanged ? "แผนก/Department" : null, posChanged ? "ตำแหน่ง/Position" : null].filter(Boolean).join(", ");
      await prisma.notification.createMany({
        data: managers.map((m) => ({
          organizationId: user.organizationId,
          userId: m.id,
          type: "ACCESS_REVIEW",
          level: "WARNING" as const,
          title: "ต้องทบทวนสิทธิ์ (Mover) / Access review needed",
          body: `${row.firstName} ${row.lastName} เปลี่ยน ${what} — โปรดทบทวนทรัพย์สิน สิทธิ์ และการเข้าถึงระบบ`,
          link: `/employees/${row.id}`,
        })),
      });
    }
    await auditLog(user, {
      action: "UPDATE",
      entityType: "EMPLOYEE",
      entityId: row.id,
      detail: {
        accessReview: true,
        departmentFrom: existing.departmentId, departmentTo: row.departmentId,
        positionFrom: existing.position, positionTo: row.position,
      },
    });
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  redirect(`/employees/${id}`);
}

export async function softDeleteEmployee(formData: FormData) {
  const user = await requirePermission("employee:delete");
  const id = z.uuid().parse(formData.get("id"));

  const existing = await prisma.employee.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, employeeCode: true, firstName: true, lastName: true, status: true, userId: true },
  });
  if (!existing) redirect("/employees?error=not-found");

  // Deleting must never be a silent back-door around offboarding: an employee
  // who still holds assets/licenses or has a live account must go through the
  // offboarding workflow so access is actually revoked and assets reclaimed.
  const [openAssignments, activeLicenses] = await Promise.all([
    prisma.assetAssignment.count({ where: { organizationId: user.organizationId, employeeId: id, status: "CHECKED_OUT" } }),
    prisma.licenseAssignment.count({ where: { employeeId: id, revokedAt: null, license: { organizationId: user.organizationId } } }),
  ]);
  const linkedActiveUser = existing.userId
    ? await prisma.user.count({ where: { id: existing.userId, status: "ACTIVE" } })
    : 0;
  if (existing.status === "ACTIVE" || openAssignments > 0 || activeLicenses > 0 || linkedActiveUser > 0) {
    // Show a friendly message on the employee page instead of a raw server
    // exception. The specific reason lets the UI guide the user.
    const reason = existing.status === "ACTIVE" ? "active"
      : openAssignments > 0 ? "assets"
      : activeLicenses > 0 ? "licenses"
      : "account";
    redirect(`/employees/${id}?error=cannot-delete&reason=${reason}`);
  }

  // Clear the user link on soft-delete so the account can be re-linked to a new
  // employee record later (Employee.userId is unique) — see DB-001.
  await prisma.employee.update({ where: { id }, data: { deletedAt: new Date(), userId: null } });
  await auditLog(user, {
    action: "DELETE",
    entityType: "EMPLOYEE",
    entityId: id,
    detail: { employeeCode: existing.employeeCode, name: `${existing.firstName} ${existing.lastName}` },
  });
  revalidatePath("/employees");
  redirect("/employees");
}

/**
 * On-demand employee sync: reconcile the employee roster against system user
 * accounts (match by employeeCode → email → unambiguous name) and refresh the
 * page. The HR roster itself flows in via the HR push sync + scheduler; this
 * button re-links any newly-added employees to their login accounts without
 * waiting for the next scheduled pass.
 */
export async function syncEmployeeLinksAction() {
  const user = await requirePermission("employee:update");
  const result = await linkEmployeesToUsers(user.organizationId);
  await auditLog(user, {
    action: "HR_LINK_SYNC",
    entityType: "EMPLOYEE",
    detail: { ...result },
  });
  revalidatePath("/employees");
  redirect(
    `/employees?synced=1&linked=${result.linked}&unmatched=${result.unmatched}&already=${result.alreadyLinked}`
  );
}

/** Start the offboarding workflow for an ACTIVE employee. */
export async function startOffboarding(formData: FormData) {
  const user = await requirePermission("offboarding:manage");
  const employeeId = z.uuid().parse(formData.get("employeeId"));

  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, status: true, employeeCode: true, firstName: true, lastName: true },
  });
  if (!employee) throw new Error("Employee not found");
  // Allow ACTIVE staff and already-RESIGNED staff (e.g. imported leavers who
  // still need assets/licenses/accounts reclaimed). Block only if already in an
  // offboarding, or if one is already open.
  if (employee.status === "OFFBOARDING") throw new Error("Employee is already being offboarded");
  if (employee.status !== "ACTIVE" && employee.status !== "RESIGNED") {
    throw new Error("Employee cannot be offboarded from this status");
  }
  const existingOpen = await prisma.offboarding.findFirst({
    where: {
      organizationId: user.organizationId,
      employeeId: employee.id,
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
    select: { id: true },
  });
  if (existingOpen) redirect(`/offboarding/${existingOpen.id}`);

  const offboarding = await prisma.offboarding.create({
    data: {
      organizationId: user.organizationId,
      employeeId: employee.id,
      requestedById: user.id,
      status: "OPEN",
    },
  });
  // Move ACTIVE staff into OFFBOARDING; leave RESIGNED staff as-is (the
  // checklist is driven by the offboarding status, not the employee status).
  if (employee.status === "ACTIVE") {
    await prisma.employee.update({ where: { id: employee.id }, data: { status: "OFFBOARDING" } });
  }

  await auditLog(user, {
    action: "CREATE",
    entityType: "OFFBOARDING",
    entityId: offboarding.id,
    detail: {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      name: `${employee.firstName} ${employee.lastName}`,
    },
  });
  revalidatePath(`/employees/${employee.id}`);
  revalidatePath("/offboarding");
  redirect(`/offboarding/${offboarding.id}`);
}
