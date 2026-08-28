"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optStr = z.preprocess(emptyToNull, z.string().max(2000).nullable().optional());
const optInt = z.preprocess((v) => {
  const s = emptyToNull(v);
  return s == null ? null : Math.round(Number(s));
}, z.number().int().min(0).max(100000).nullable().optional());

const schema = z.object({
  name: z.string().min(1).max(200),
  category: optStr,
  description: optStr,
  fulfillmentTeam: optStr,
  slaHours: optInt,
  requiresApproval: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function createCatalogItem(formData: FormData) {
  const user = await requirePermission("catalog:manage");
  const i = schema.parse(Object.fromEntries(formData));
  try {
    const c = await prisma.serviceCatalogItem.create({
      data: {
        organizationId: user.organizationId, name: i.name.trim(), category: i.category ?? null,
        description: i.description ?? null, fulfillmentTeam: i.fulfillmentTeam ?? null,
        slaHours: i.slaHours ?? null, requiresApproval: i.requiresApproval ?? false,
      },
    });
    await auditLog(user, { action: "CREATE", entityType: "SERVICE_CATALOG", entityId: c.id, detail: { name: c.name } });
  } catch {
    redirect("/catalog?error=dup");
  }
  revalidatePath("/catalog");
  redirect("/catalog?ok=created");
}

export async function toggleCatalogItem(formData: FormData) {
  const user = await requirePermission("catalog:manage");
  const id = z.string().uuid().parse(formData.get("id"));
  const item = await prisma.serviceCatalogItem.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true, active: true } });
  if (!item) redirect("/catalog");
  await prisma.serviceCatalogItem.update({ where: { id }, data: { active: !item.active } });
  revalidatePath("/catalog");
  redirect("/catalog?ok=toggled");
}

export async function deleteCatalogItem(formData: FormData) {
  const user = await requirePermission("catalog:manage");
  const id = z.string().uuid().parse(formData.get("id"));
  await prisma.serviceCatalogItem.updateMany({ where: { id, organizationId: user.organizationId }, data: { deletedAt: new Date() } });
  revalidatePath("/catalog");
  redirect("/catalog?ok=deleted");
}
