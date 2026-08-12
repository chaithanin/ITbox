"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/session";
import { auditLog } from "@/lib/audit";

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
    select: { id: true },
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
  await auditLog(user, {
    action: "UPDATE",
    entityType: "EMPLOYEE",
    entityId: row.id,
    detail: { employeeCode: row.employeeCode, name: `${row.firstName} ${row.lastName}` },
  });
  revalidatePath("/employees");
  revalidatePath(`/employees/${id}`);
  redirect(`/employees/${id}`);
}

export async function softDeleteEmployee(formData: FormData) {
  const user = await requirePermission("employee:delete");
  const id = z.uuid().parse(formData.get("id"));

  const existing = await prisma.employee.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, employeeCode: true, firstName: true, lastName: true },
  });
  if (!existing) throw new Error("Employee not found");

  await prisma.employee.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, {
    action: "DELETE",
    entityType: "EMPLOYEE",
    entityId: id,
    detail: { employeeCode: existing.employeeCode, name: `${existing.firstName} ${existing.lastName}` },
  });
  revalidatePath("/employees");
  redirect("/employees");
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
  if (employee.status !== "ACTIVE") throw new Error("Employee is not ACTIVE");

  const offboarding = await prisma.offboarding.create({
    data: {
      organizationId: user.organizationId,
      employeeId: employee.id,
      requestedById: user.id,
      status: "OPEN",
    },
  });
  await prisma.employee.update({ where: { id: employee.id }, data: { status: "OFFBOARDING" } });

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
