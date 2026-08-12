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
    notes: optStr(input.notes),
  };
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
    select: { id: true },
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
    detail: { assetTag: asset.assetTag, name: asset.name },
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
  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, assetTag: true, status: true },
  });
  if (!asset) throw new Error("Asset not found");
  if (asset.status === "DISPOSED") throw new Error("Asset is already disposed");

  await prisma.asset.update({
    where: { id },
    data: { status, assignedToId: null },
  });
  await prisma.assetHistory.create({
    data: {
      organizationId: user.organizationId,
      assetId: id,
      action: historyAction,
      detail: `${detailText} ${asset.assetTag}`,
      actorId: user.id,
    },
  });
  await auditLog(user, {
    action: historyAction,
    entityType: "ASSET",
    entityId: id,
    detail: { assetTag: asset.assetTag, fromStatus: asset.status, toStatus: status },
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

  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, assetTag: true, name: true, status: true },
  });
  if (!asset) throw new Error("Asset not found");
  if (asset.status !== "AVAILABLE") throw new Error("Asset is not available for assignment");

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

  await prisma.assetAssignment.create({
    data: {
      organizationId: user.organizationId,
      assetId: asset.id,
      employeeId: employee.id,
      status: "CHECKED_OUT",
      assignedById: user.id,
      purpose: optStr(input.purpose),
      expectedReturnDate: optDate(input.expectedReturnDate),
      conditionBefore: input.conditionBefore ?? null,
      remark: optStr(input.remark),
    },
  });
  await prisma.asset.update({
    where: { id: asset.id },
    data: { status: "ASSIGNED", assignedToId: employee.id },
  });
  await prisma.assetHistory.create({
    data: {
      organizationId: user.organizationId,
      assetId: asset.id,
      action: "ASSIGN",
      detail: `มอบหมายให้ / Assigned to ${employee.firstName} ${employee.lastName}`,
      actorId: user.id,
    },
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

  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, assetTag: true },
  });
  if (!asset) throw new Error("Asset not found");

  const assignment = await prisma.assetAssignment.findFirst({
    where: { organizationId: user.organizationId, assetId: asset.id, status: "CHECKED_OUT" },
    orderBy: { assignedAt: "desc" },
    include: { employee: { select: { firstName: true, lastName: true } } },
  });
  if (!assignment) throw new Error("No open assignment for this asset");

  await prisma.assetAssignment.update({
    where: { id: assignment.id },
    data: {
      status: "RETURNED",
      returnedAt: new Date(),
      returnedById: user.id,
      conditionAfter: input.conditionAfter,
      damageNotes: optStr(input.damageNotes),
      remark: optStr(input.remark) ?? assignment.remark,
    },
  });
  await prisma.asset.update({
    where: { id: asset.id },
    data: { status: "AVAILABLE", assignedToId: null, condition: input.conditionAfter },
  });
  await prisma.assetHistory.create({
    data: {
      organizationId: user.organizationId,
      assetId: asset.id,
      action: "RETURN",
      detail: `รับคืนจาก / Returned from ${assignment.employee.firstName} ${assignment.employee.lastName} (สภาพ / condition: ${input.conditionAfter})`,
      actorId: user.id,
    },
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

  const asset = await prisma.asset.findFirst({
    where: { id: input.assetId, organizationId: user.organizationId, deletedAt: null },
    select: {
      id: true,
      assetTag: true,
      departmentId: true,
      locationId: true,
      assignedToId: true,
    },
  });
  if (!asset) throw new Error("Asset not found");

  await prisma.assetTransfer.create({
    data: {
      organizationId: user.organizationId,
      assetId: asset.id,
      fromDepartmentId: asset.departmentId,
      toDepartmentId,
      fromLocationId: asset.locationId,
      toLocationId,
      fromEmployeeId: asset.assignedToId,
      toEmployeeId,
      reason: optStr(input.reason),
      status: "COMPLETED",
      requestedById: user.id,
      completedAt: new Date(),
    },
  });
  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      ...(toDepartmentId ? { departmentId: toDepartmentId } : {}),
      ...(toLocationId ? { locationId: toLocationId } : {}),
      ...(toEmployeeId ? { assignedToId: toEmployeeId } : {}),
    },
  });
  await prisma.assetHistory.create({
    data: {
      organizationId: user.organizationId,
      assetId: asset.id,
      action: "TRANSFER",
      detail: `โอนย้ายทรัพย์สิน / Transferred asset ${asset.assetTag}`,
      actorId: user.id,
    },
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
