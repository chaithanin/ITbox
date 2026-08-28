"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

// "use server" files may only export async functions — keep constants local.
const ASSET_CONDITIONS = ["NEW", "GOOD", "FAIR", "DAMAGED", "CRITICAL"] as const;

const assetSchema = z.object({
  assetTag: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  serialNumber: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  specification: z.string().optional(),
  categoryId: z.string().optional(),
  departmentId: z.string().optional(),
  locationId: z.string().optional(),
  vendorId: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.string().optional(),
  warrantyStart: z.string().optional(),
  warrantyEnd: z.string().optional(),
  invoiceNumber: z.string().optional(),
  condition: z.enum(ASSET_CONDITIONS).default("NEW"),
  costCenter: z.string().optional(),
  project: z.string().optional(),
  ipAddress: z.string().optional(),
  macAddress: z.string().optional(),
  imei: z.string().optional(),
  notes: z.string().optional(),
});

function optStr(v: string | undefined): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function optDate(v: string | undefined): Date | null {
  const t = v?.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

function optNum(v: string | undefined): number | null {
  const t = v?.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

function assetData(input: z.infer<typeof assetSchema>) {
  return {
    assetTag: input.assetTag.trim(),
    name: input.name.trim(),
    serialNumber: optStr(input.serialNumber),
    brand: optStr(input.brand),
    model: optStr(input.model),
    specification: optStr(input.specification),
    categoryId: optStr(input.categoryId),
    departmentId: optStr(input.departmentId),
    locationId: optStr(input.locationId),
    vendorId: optStr(input.vendorId),
    purchaseDate: optDate(input.purchaseDate),
    purchasePrice: optNum(input.purchasePrice),
    warrantyStart: optDate(input.warrantyStart),
    warrantyEnd: optDate(input.warrantyEnd),
    invoiceNumber: optStr(input.invoiceNumber),
    condition: input.condition,
    costCenter: optStr(input.costCenter),
    project: optStr(input.project),
    ipAddress: optStr(input.ipAddress),
    macAddress: optStr(input.macAddress),
    imei: optStr(input.imei),
    notes: optStr(input.notes),
  };
}

/** Flag duplicate hardware identifiers (serial / MAC / IMEI) within the org. */
async function assertNoDuplicateIdentifiers(
  organizationId: string,
  data: { serialNumber: string | null; macAddress: string | null; imei: string | null },
  excludeId?: string
) {
  const checks: { field: "serialNumber" | "macAddress" | "imei"; value: string | null; label: string }[] = [
    { field: "serialNumber", value: data.serialNumber, label: "Serial number" },
    { field: "macAddress", value: data.macAddress, label: "MAC address" },
    { field: "imei", value: data.imei, label: "IMEI" },
  ];
  for (const c of checks) {
    if (!c.value) continue;
    const dup = await prisma.asset.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        [c.field]: c.value,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true, assetTag: true },
    });
    if (dup) throw new Error(`${c.label} "${c.value}" already exists on asset ${dup.assetTag}`);
  }
}

export async function createAsset(formData: FormData) {
  const user = await requirePermission("asset:create");
  const input = assetSchema.parse(Object.fromEntries(formData));
  const data = assetData(input);

  const dup = await prisma.asset.findFirst({
    where: { organizationId: user.organizationId, assetTag: data.assetTag, deletedAt: null },
    select: { id: true },
  });
  if (dup) throw new Error(`Asset tag "${data.assetTag}" already exists`);
  await assertNoDuplicateIdentifiers(user.organizationId, data);

  const asset = await prisma.asset.create({
    data: { ...data, organizationId: user.organizationId },
  });
  await prisma.assetHistory.create({
    data: {
      organizationId: user.organizationId,
      assetId: asset.id,
      action: "REGISTER",
      detail: `ลงทะเบียนทรัพย์สิน / Registered asset ${asset.assetTag}`,
      actorId: user.id,
    },
  });
  await auditLog(user, {
    action: "CREATE",
    entityType: "ASSET",
    entityId: asset.id,
    detail: { assetTag: asset.assetTag, name: asset.name },
  });
  revalidatePath("/assets");
  redirect(`/assets/${asset.id}`);
}

export async function updateAsset(formData: FormData) {
  const user = await requirePermission("asset:update");
  const id = z.string().uuid().parse(formData.get("id"));
  const input = assetSchema.parse(Object.fromEntries(formData));
  const data = assetData(input);

  const existing = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!existing) throw new Error("Asset not found");

  const dup = await prisma.asset.findFirst({
    where: {
      organizationId: user.organizationId,
      assetTag: data.assetTag,
      deletedAt: null,
      NOT: { id },
    },
    select: { id: true },
  });
  if (dup) throw new Error(`Asset tag "${data.assetTag}" already exists`);
  await assertNoDuplicateIdentifiers(user.organizationId, data, id);

  // Capture a before/after diff of only the fields that actually changed, for a
  // forensic audit trail (never store secret-bearing fields — assets have none).
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    const prev = (existing as Record<string, unknown>)[k];
    const prevCmp = prev instanceof Date ? prev.getTime() : prev;
    const nextCmp = v instanceof Date ? v.getTime() : v;
    if (prevCmp !== nextCmp) {
      before[k] = prev instanceof Date ? prev.toISOString() : prev;
      after[k] = v instanceof Date ? v.toISOString() : v;
    }
  }

  const asset = await prisma.asset.update({ where: { id }, data });
  await prisma.assetHistory.create({
    data: {
      organizationId: user.organizationId,
      assetId: asset.id,
      action: "UPDATE",
      detail: `แก้ไขข้อมูลทรัพย์สิน / Updated asset ${asset.assetTag}`,
      actorId: user.id,
    },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "ASSET",
    entityId: asset.id,
    detail: { assetTag: asset.assetTag, name: asset.name, changed: Object.keys(after), before, after },
  });
  revalidatePath("/assets");
  revalidatePath(`/assets/${asset.id}`);
  redirect(`/assets/${asset.id}`);
}

async function setLifecycleStatus(
  formData: FormData,
  status: "RETIRED" | "DISPOSED",
  historyAction: "RETIRE" | "DISPOSE",
  detailText: string
) {
  const user = await requirePermission("asset:dispose");
  const id = z.string().uuid().parse(formData.get("id"));
  // Optional disposal evidence: a data-wipe confirmation and a free-text note.
  const wipeConfirmed = formData.get("wipeConfirmed") === "on" || formData.get("wipeConfirmed") === "true";
  const disposalNote = optStr((formData.get("disposalNote") as string | null) ?? undefined);

  const asset = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM assets WHERE id = ${id}::uuid FOR UPDATE`;
    const a = await tx.asset.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, assetTag: true, status: true },
    });
    if (!a) throw new Error("Asset not found");
    if (a.status === "DISPOSED") throw new Error("Asset is already disposed");

    // Force-close any still-open assignment so a retired/disposed asset can
    // never remain "held" by a former custodian.
    await tx.assetAssignment.updateMany({
      where: { organizationId: user.organizationId, assetId: id, status: "CHECKED_OUT" },
      data: { status: "RETURNED", returnedAt: new Date(), returnedById: user.id, remark: `Closed by ${historyAction.toLowerCase()}` },
    });
    await tx.asset.update({
      where: { id },
      data: { status, assignedToId: null },
    });
    const wipeText = status === "DISPOSED" ? ` · data wipe: ${wipeConfirmed ? "confirmed" : "NOT confirmed"}` : "";
    await tx.assetHistory.create({
      data: {
        organizationId: user.organizationId,
        assetId: id,
        action: historyAction,
        detail: `${detailText} ${a.assetTag}${wipeText}${disposalNote ? ` · ${disposalNote}` : ""}`,
        actorId: user.id,
      },
    });
    return a;
  });

  await auditLog(user, {
    action: historyAction,
    entityType: "ASSET",
    entityId: id,
    detail: { assetTag: asset.assetTag, fromStatus: asset.status, toStatus: status, wipeConfirmed: status === "DISPOSED" ? wipeConfirmed : undefined, disposalNote },
  });
  revalidatePath("/assets");
  revalidatePath(`/assets/${id}`);
}

export async function retireAsset(formData: FormData) {
  await setLifecycleStatus(formData, "RETIRED", "RETIRE", "ปลดระวางทรัพย์สิน / Retired asset");
}

export async function disposeAsset(formData: FormData) {
  await setLifecycleStatus(formData, "DISPOSED", "DISPOSE", "จำหน่ายทรัพย์สินออก / Disposed asset");
}

export async function deleteAsset(formData: FormData) {
  const user = await requirePermission("asset:delete");
  const id = z.string().uuid().parse(formData.get("id"));
  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, assetTag: true },
  });
  if (!asset) throw new Error("Asset not found");

  await prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, {
    action: "DELETE",
    entityType: "ASSET",
    entityId: id,
    detail: { assetTag: asset.assetTag },
  });
  revalidatePath("/assets");
  redirect("/assets");
}

const assignSchema = z.object({
  assetId: z.string().uuid(),
  employeeId: z.string().uuid(),
  purpose: z.string().optional(),
  expectedReturnDate: z.string().optional(),
  conditionBefore: z.enum(ASSET_CONDITIONS).optional(),
  remark: z.string().optional(),
});

export async function assignAsset(formData: FormData) {
  const user = await requirePermission("asset:assign");
  const input = assignSchema.parse(Object.fromEntries(formData));

  const employee = await prisma.employee.findFirst({
    where: {
      id: input.employeeId,
      organizationId: user.organizationId,
      deletedAt: null,
      status: "ACTIVE",
    },
    select: { id: true, firstName: true, lastName: true, userId: true },
  });
  if (!employee) throw new Error("Employee not found or not active");

  // Serialize concurrent assigns on the same asset: lock the asset row, then
  // check-and-write inside one transaction so two agents cannot double-assign.
  const asset = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM assets WHERE id = ${input.assetId}::uuid FOR UPDATE`;
    const a = await tx.asset.findFirst({
      where: { id: input.assetId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, assetTag: true, name: true, status: true },
    });
    if (!a) throw new Error("Asset not found");
    if (a.status !== "AVAILABLE") throw new Error("Asset is not available for assignment");

    await tx.assetAssignment.create({
      data: {
        organizationId: user.organizationId,
        assetId: a.id,
        employeeId: employee.id,
        status: "CHECKED_OUT",
        assignedById: user.id,
        purpose: optStr(input.purpose),
        expectedReturnDate: optDate(input.expectedReturnDate),
        conditionBefore: input.conditionBefore ?? null,
        remark: optStr(input.remark),
      },
    });
    await tx.asset.update({
      where: { id: a.id },
      data: { status: "ASSIGNED", assignedToId: employee.id },
    });
    await tx.assetHistory.create({
      data: {
        organizationId: user.organizationId,
        assetId: a.id,
        action: "ASSIGN",
        detail: `มอบหมายให้ / Assigned to ${employee.firstName} ${employee.lastName}`,
        actorId: user.id,
      },
    });
    return a;
  });

  await auditLog(user, {
    action: "ASSIGN",
    entityType: "ASSET",
    entityId: asset.id,
    detail: { assetTag: asset.assetTag, employeeId: employee.id },
  });

  if (employee.userId) {
    await prisma.notification.create({
      data: {
        organizationId: user.organizationId,
        userId: employee.userId,
        type: "ASSET_ASSIGNED",
        level: "INFO",
        title: `คุณได้รับมอบหมายทรัพย์สิน / Asset assigned to you: ${asset.assetTag}`,
        body: `${asset.name} (${asset.assetTag})`,
        link: `/assets/${asset.id}`,
      },
    });
  }

  revalidatePath("/assets");
  revalidatePath(`/assets/${asset.id}`);
  redirect(`/assets/${asset.id}`);
}

const returnSchema = z.object({
  assetId: z.string().uuid(),
  conditionAfter: z.enum(ASSET_CONDITIONS),
  damageNotes: z.string().optional(),
  remark: z.string().optional(),
});

export async function returnAsset(formData: FormData) {
  const user = await requirePermission("asset:return");
  const input = returnSchema.parse(Object.fromEntries(formData));

  const asset = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM assets WHERE id = ${input.assetId}::uuid FOR UPDATE`;
    const a = await tx.asset.findFirst({
      where: { id: input.assetId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, assetTag: true },
    });
    if (!a) throw new Error("Asset not found");

    // Close ALL open assignments for this asset (defensive against any legacy
    // double-assignment), not just the newest one.
    const openAssignments = await tx.assetAssignment.findMany({
      where: { organizationId: user.organizationId, assetId: a.id, status: "CHECKED_OUT" },
      orderBy: { assignedAt: "desc" },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    if (openAssignments.length === 0) throw new Error("No open assignment for this asset");

    await tx.assetAssignment.updateMany({
      where: { organizationId: user.organizationId, assetId: a.id, status: "CHECKED_OUT" },
      data: {
        status: "RETURNED",
        returnedAt: new Date(),
        returnedById: user.id,
        conditionAfter: input.conditionAfter,
        damageNotes: optStr(input.damageNotes),
        ...(optStr(input.remark) ? { remark: optStr(input.remark) } : {}),
      },
    });
    await tx.asset.update({
      where: { id: a.id },
      data: { status: "AVAILABLE", assignedToId: null, condition: input.conditionAfter },
    });
    const holder = openAssignments[0].employee;
    await tx.assetHistory.create({
      data: {
        organizationId: user.organizationId,
        assetId: a.id,
        action: "RETURN",
        detail: `รับคืนจาก / Returned from ${holder.firstName} ${holder.lastName} (สภาพ / condition: ${input.conditionAfter})`,
        actorId: user.id,
      },
    });
    return a;
  });

  await auditLog(user, {
    action: "RETURN",
    entityType: "ASSET",
    entityId: asset.id,
    detail: { assetTag: asset.assetTag, conditionAfter: input.conditionAfter },
  });

  revalidatePath("/assets");
  revalidatePath(`/assets/${asset.id}`);
  redirect(`/assets/${asset.id}`);
}

const transferSchema = z
  .object({
    assetId: z.string().uuid(),
    toDepartmentId: z.string().optional(),
    toLocationId: z.string().optional(),
    toEmployeeId: z.string().optional(),
    reason: z.string().optional(),
  })
  .refine(
    (v) => Boolean(optStr(v.toDepartmentId) || optStr(v.toLocationId) || optStr(v.toEmployeeId)),
    { message: "At least one transfer target is required" }
  );

export async function transferAsset(formData: FormData) {
  const user = await requirePermission("asset:transfer");
  const input = transferSchema.parse(Object.fromEntries(formData));
  const toDepartmentId = optStr(input.toDepartmentId);
  const toLocationId = optStr(input.toLocationId);
  const toEmployeeId = optStr(input.toEmployeeId);

  // Validate the target employee (same org + ACTIVE) BEFORE mutating, mirroring
  // assignAsset — a transfer must not point custody at a missing/inactive person.
  if (toEmployeeId) {
    const target = await prisma.employee.findFirst({
      where: { id: toEmployeeId, organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true },
    });
    if (!target) throw new Error("Target employee not found or not active");
  }

  const asset = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM assets WHERE id = ${input.assetId}::uuid FOR UPDATE`;
    const a = await tx.asset.findFirst({
      where: { id: input.assetId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, assetTag: true, departmentId: true, locationId: true, assignedToId: true, status: true },
    });
    if (!a) throw new Error("Asset not found");

    await tx.assetTransfer.create({
      data: {
        organizationId: user.organizationId,
        assetId: a.id,
        fromDepartmentId: a.departmentId,
        toDepartmentId,
        fromLocationId: a.locationId,
        toLocationId,
        fromEmployeeId: a.assignedToId,
        toEmployeeId,
        reason: optStr(input.reason),
        status: "COMPLETED",
        requestedById: user.id,
        completedAt: new Date(),
      },
    });

    // When custody changes, keep the assignment ledger consistent:
    // close every open assignment, then open a fresh one for the new holder.
    if (toEmployeeId) {
      await tx.assetAssignment.updateMany({
        where: { organizationId: user.organizationId, assetId: a.id, status: "CHECKED_OUT" },
        data: { status: "RETURNED", returnedAt: new Date(), returnedById: user.id, remark: "Closed by transfer" },
      });
      await tx.assetAssignment.create({
        data: {
          organizationId: user.organizationId,
          assetId: a.id,
          employeeId: toEmployeeId,
          status: "CHECKED_OUT",
          assignedById: user.id,
          purpose: optStr(input.reason) ?? "Transfer",
        },
      });
    }

    await tx.asset.update({
      where: { id: a.id },
      data: {
        ...(toDepartmentId ? { departmentId: toDepartmentId } : {}),
        ...(toLocationId ? { locationId: toLocationId } : {}),
        ...(toEmployeeId ? { assignedToId: toEmployeeId, status: "ASSIGNED" } : {}),
      },
    });
    await tx.assetHistory.create({
      data: {
        organizationId: user.organizationId,
        assetId: a.id,
        action: "TRANSFER",
        detail: `โอนย้ายทรัพย์สิน / Transferred asset ${a.assetTag}`,
        actorId: user.id,
      },
    });
    return a;
  });

  await auditLog(user, {
    action: "TRANSFER",
    entityType: "ASSET",
    entityId: asset.id,
    detail: { assetTag: asset.assetTag, toDepartmentId, toLocationId, toEmployeeId },
  });

  revalidatePath("/assets");
  revalidatePath(`/assets/${asset.id}`);
  redirect(`/assets/${asset.id}`);
}
