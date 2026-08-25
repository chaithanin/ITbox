"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const departmentSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  division: z.string().max(200).optional(),
  costCenter: z.string().max(100).optional(),
});

const nul = (v: string | undefined) => (v ? v : null);

export async function createDepartment(formData: FormData) {
  const user = await requirePermission("department:manage");
  const input = departmentSchema.parse(Object.fromEntries(formData));

  const dup = await prisma.department.findFirst({
    where: { organizationId: user.organizationId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (dup) throw new Error("Department code already exists");

  const row = await prisma.department.create({
    data: {
      organizationId: user.organizationId,
      code: input.code,
      name: input.name,
      division: nul(input.division),
      costCenter: nul(input.costCenter),
    },
  });
  await auditLog(user, {
    action: "CREATE",
    entityType: "DEPARTMENT",
    entityId: row.id,
    detail: { code: row.code, name: row.name },
  });
  revalidatePath("/departments");
  redirect("/departments");
}

export async function updateDepartment(formData: FormData) {
  const user = await requirePermission("department:manage");
  const id = z.uuid().parse(formData.get("id"));
  const input = departmentSchema.parse(Object.fromEntries(formData));

  const existing = await prisma.department.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Department not found");

  const dup = await prisma.department.findFirst({
    where: { organizationId: user.organizationId, code: input.code, deletedAt: null, NOT: { id } },
    select: { id: true },
  });
  if (dup) throw new Error("Department code already exists");

  const row = await prisma.department.update({
    where: { id },
    data: {
      code: input.code,
      name: input.name,
      division: nul(input.division),
      costCenter: nul(input.costCenter),
    },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "DEPARTMENT",
    entityId: row.id,
    detail: { code: row.code, name: row.name },
  });
  revalidatePath("/departments");
  revalidatePath(`/departments/${id}`);
  redirect(`/departments/${id}`);
}

export async function softDeleteDepartment(formData: FormData) {
  const user = await requirePermission("department:manage");
  const id = z.uuid().parse(formData.get("id"));

  const existing = await prisma.department.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!existing) throw new Error("Department not found");

  const activeEmployees = await prisma.employee.count({
    where: { organizationId: user.organizationId, departmentId: id, deletedAt: null },
  });
  if (activeEmployees > 0) {
    throw new Error("Cannot delete a department that still has active employees");
  }

  await prisma.department.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, {
    action: "DELETE",
    entityType: "DEPARTMENT",
    entityId: id,
    detail: { code: existing.code, name: existing.name },
  });
  revalidatePath("/departments");
  redirect("/departments");
}

/**
 * Merge one department into another: reassign every record that references the
 * source department (employees, assets, vault items/shares, purchase requests,
 * support cases) to the target, then soft-delete the source. Used to clean up
 * duplicates created by imports (e.g. "IT" + "Information Technology").
 */
export async function mergeDepartment(formData: FormData) {
  const user = await requirePermission("department:manage");
  const sourceId = z.uuid().parse(formData.get("sourceId"));
  const targetId = z.uuid().parse(formData.get("targetId"));
  if (sourceId === targetId) redirect(`/departments/${sourceId}?error=same`);

  const orgId = user.organizationId;
  const [source, target] = await Promise.all([
    prisma.department.findFirst({ where: { id: sourceId, organizationId: orgId, deletedAt: null }, select: { id: true, code: true, name: true } }),
    prisma.department.findFirst({ where: { id: targetId, organizationId: orgId, deletedAt: null }, select: { id: true, code: true, name: true } }),
  ]);
  if (!source || !target) redirect(`/departments/${sourceId}?error=notfound`);

  await prisma.$transaction([
    prisma.employee.updateMany({ where: { organizationId: orgId, departmentId: sourceId }, data: { departmentId: targetId } }),
    prisma.asset.updateMany({ where: { organizationId: orgId, departmentId: sourceId }, data: { departmentId: targetId } }),
    prisma.vaultItem.updateMany({ where: { organizationId: orgId, departmentId: sourceId }, data: { departmentId: targetId } }),
    prisma.vaultShare.updateMany({ where: { departmentId: sourceId }, data: { departmentId: targetId } }),
    prisma.purchaseRequest.updateMany({ where: { organizationId: orgId, departmentId: sourceId }, data: { departmentId: targetId } }),
    prisma.supportCase.updateMany({ where: { organizationId: orgId, departmentId: sourceId }, data: { departmentId: targetId } }),
    prisma.department.update({ where: { id: sourceId }, data: { deletedAt: new Date() } }),
  ]);

  await auditLog(user, {
    action: "UPDATE",
    entityType: "DEPARTMENT",
    entityId: targetId,
    detail: { merged: true, from: { code: source!.code, name: source!.name }, into: { code: target!.code, name: target!.name } },
  });
  revalidatePath("/departments");
  redirect(`/departments/${targetId}?ok=merged`);
}
