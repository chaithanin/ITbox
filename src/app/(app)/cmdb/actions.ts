"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optStr = z.preprocess(emptyToNull, z.string().max(2000).nullable().optional());
const optUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());
const CI_TYPES = ["APPLICATION", "SERVICE", "SERVER", "DATABASE", "NETWORK", "STORAGE", "OTHER"] as const;
const CI_STATUS = ["ACTIVE", "DEGRADED", "OFFLINE", "RETIRED"] as const;
const REL_TYPES = ["DEPENDS_ON", "RUNS_ON", "CONNECTS_TO", "HOSTS", "USES"] as const;

const ciSchema = z.object({
  name: z.string().min(1).max(200),
  ciType: z.enum(CI_TYPES),
  status: z.enum(CI_STATUS),
  description: optStr, owner: optStr, assetId: optUuid,
});

export async function createCi(formData: FormData) {
  const user = await requirePermission("cmdb:manage");
  const i = ciSchema.parse(Object.fromEntries(formData));
  try {
    const ci = await prisma.configurationItem.create({
      data: { organizationId: user.organizationId, name: i.name.trim(), ciType: i.ciType, status: i.status, description: i.description ?? null, owner: i.owner ?? null, assetId: i.assetId ?? null },
    });
    await auditLog(user, { action: "CREATE", entityType: "CONFIG_ITEM", entityId: ci.id, detail: { name: ci.name } });
  } catch {
    redirect("/cmdb?error=dup");
  }
  revalidatePath("/cmdb");
  redirect("/cmdb?ok=created");
}

export async function setCiStatus(id: string, formData: FormData) {
  const user = await requirePermission("cmdb:manage");
  const status = z.enum(CI_STATUS).parse(formData.get("status"));
  const ci = await prisma.configurationItem.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true, name: true } });
  if (!ci) redirect("/cmdb");
  await prisma.configurationItem.update({ where: { id }, data: { status } });
  await auditLog(user, { action: "UPDATE", entityType: "CONFIG_ITEM", entityId: id, detail: { name: ci.name, status } });
  revalidatePath("/cmdb");
  revalidatePath(`/cmdb/${id}`);
  redirect(`/cmdb/${id}?ok=status`);
}

export async function deleteCi(formData: FormData) {
  const user = await requirePermission("cmdb:manage");
  const id = z.string().uuid().parse(formData.get("id"));
  // Hard delete cascades relationships; keep as soft delete for the CI record.
  await prisma.ciRelationship.deleteMany({ where: { organizationId: user.organizationId, OR: [{ sourceId: id }, { targetId: id }] } });
  await prisma.configurationItem.updateMany({ where: { id, organizationId: user.organizationId }, data: { deletedAt: new Date() } });
  await auditLog(user, { action: "DELETE", entityType: "CONFIG_ITEM", entityId: id });
  revalidatePath("/cmdb");
  redirect("/cmdb?ok=deleted");
}

export async function addRelationship(sourceId: string, formData: FormData) {
  const user = await requirePermission("cmdb:manage");
  const targetId = z.string().uuid().parse(formData.get("targetId"));
  const relType = z.enum(REL_TYPES).parse(formData.get("relType"));
  if (targetId === sourceId) redirect(`/cmdb/${sourceId}?error=self`);
  const [src, tgt] = await Promise.all([
    prisma.configurationItem.findFirst({ where: { id: sourceId, organizationId: user.organizationId, deletedAt: null }, select: { id: true } }),
    prisma.configurationItem.findFirst({ where: { id: targetId, organizationId: user.organizationId, deletedAt: null }, select: { id: true } }),
  ]);
  if (!src || !tgt) redirect(`/cmdb/${sourceId}?error=ci`);
  try {
    await prisma.ciRelationship.create({ data: { organizationId: user.organizationId, sourceId, targetId, relType } });
  } catch { /* duplicate relationship — ignore */ }
  revalidatePath(`/cmdb/${sourceId}`);
  redirect(`/cmdb/${sourceId}?ok=rel`);
}

export async function deleteRelationship(sourceId: string, formData: FormData) {
  const user = await requirePermission("cmdb:manage");
  const id = z.string().uuid().parse(formData.get("id"));
  await prisma.ciRelationship.deleteMany({ where: { id, organizationId: user.organizationId } });
  revalidatePath(`/cmdb/${sourceId}`);
  redirect(`/cmdb/${sourceId}?ok=reldel`);
}
