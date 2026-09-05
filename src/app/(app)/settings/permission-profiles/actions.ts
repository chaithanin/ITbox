"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optStr = z.preprocess(emptyToNull, z.string().max(500).nullable().optional());
const LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "IT_ADMIN"] as const;
const STATUSES = ["REQUIRED", "OPTIONAL", "RESTRICTED", "NOT_ALLOWED"] as const;

const profileSchema = z.object({
  name: z.string().min(1).max(200),
  company: optStr,
  department: optStr,
  position: optStr,
  jobLevel: z.preprocess((v) => (typeof v === "string" && (LEVELS as readonly string[]).includes(v) ? v : null), z.enum(LEVELS).nullable().optional()),
  isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  requiresManagerApproval: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  requiresSystemOwnerApproval: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  requiresItManagerApproval: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  requiresManagementApproval: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  notes: optStr,
});

const itemSchema = z.object({
  system: z.string().min(1).max(100),
  resource: z.preprocess(emptyToNull, z.string().max(200).nullable().optional()),
  permissionLevel: z.string().min(1).max(60),
  defaultStatus: z.enum(STATUSES),
  requiresApproval: z.boolean().optional().default(false),
});

function parseItems(raw: FormDataEntryValue | null): z.infer<typeof itemSchema>[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  let arr: unknown;
  try { arr = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(arr)) return [];
  const out: z.infer<typeof itemSchema>[] = [];
  for (const x of arr) { const p = itemSchema.safeParse(x); if (p.success) out.push(p.data); }
  return out;
}

function toProfileData(i: z.infer<typeof profileSchema>) {
  return {
    name: i.name, company: i.company ?? null, department: i.department ?? null, position: i.position ?? null,
    jobLevel: i.jobLevel ?? null, isActive: i.isActive,
    requiresManagerApproval: i.requiresManagerApproval, requiresSystemOwnerApproval: i.requiresSystemOwnerApproval,
    requiresItManagerApproval: i.requiresItManagerApproval, requiresManagementApproval: i.requiresManagementApproval,
    notes: i.notes ?? null,
  };
}

export async function createProfile(formData: FormData) {
  const user = await requirePermission("permprofile:manage");
  const input = profileSchema.parse(Object.fromEntries(formData));
  const items = parseItems(formData.get("itemsJson"));
  const profile = await prisma.permissionProfile.create({
    data: { organizationId: user.organizationId, ...toProfileData(input), items: { create: items } },
    select: { id: true },
  });
  await auditLog(user, { action: "CREATE", entityType: "PERMISSION_PROFILE", entityId: profile.id, detail: { name: input.name, items: items.length } });
  revalidatePath("/settings/permission-profiles");
  redirect(`/settings/permission-profiles/${profile.id}`);
}

export async function updateProfile(id: string, formData: FormData) {
  const user = await requirePermission("permprofile:manage");
  const input = profileSchema.parse(Object.fromEntries(formData));
  const items = parseItems(formData.get("itemsJson"));
  const existing = await prisma.permissionProfile.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true } });
  if (!existing) redirect("/settings/permission-profiles");
  await prisma.$transaction([
    prisma.permissionProfileItem.deleteMany({ where: { profileId: id } }),
    prisma.permissionProfile.update({ where: { id }, data: { ...toProfileData(input), items: { create: items } } }),
  ]);
  await auditLog(user, { action: "UPDATE", entityType: "PERMISSION_PROFILE", entityId: id, detail: { name: input.name, items: items.length } });
  revalidatePath("/settings/permission-profiles");
  revalidatePath(`/settings/permission-profiles/${id}`);
  redirect(`/settings/permission-profiles/${id}?ok=saved`);
}

export async function duplicateProfile(id: string) {
  const user = await requirePermission("permprofile:manage");
  const src = await prisma.permissionProfile.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, include: { items: true } });
  if (!src) redirect("/settings/permission-profiles");
  const copy = await prisma.permissionProfile.create({
    data: {
      organizationId: user.organizationId, name: `${src.name} (copy)`, company: src.company, department: src.department,
      position: src.position, jobLevel: src.jobLevel, isActive: false,
      requiresManagerApproval: src.requiresManagerApproval, requiresSystemOwnerApproval: src.requiresSystemOwnerApproval,
      requiresItManagerApproval: src.requiresItManagerApproval, requiresManagementApproval: src.requiresManagementApproval,
      notes: src.notes,
      items: { create: src.items.map((i) => ({ system: i.system, resource: i.resource, permissionLevel: i.permissionLevel, defaultStatus: i.defaultStatus, requiresApproval: i.requiresApproval })) },
    },
    select: { id: true },
  });
  await auditLog(user, { action: "CREATE", entityType: "PERMISSION_PROFILE", entityId: copy.id, detail: { duplicatedFrom: id } });
  revalidatePath("/settings/permission-profiles");
  redirect(`/settings/permission-profiles/${copy.id}`);
}

export async function toggleProfile(id: string, formData: FormData) {
  const user = await requirePermission("permprofile:manage");
  const active = formData.get("active") === "true";
  const existing = await prisma.permissionProfile.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true } });
  if (!existing) redirect("/settings/permission-profiles");
  await prisma.permissionProfile.update({ where: { id }, data: { isActive: active } });
  await auditLog(user, { action: "UPDATE", entityType: "PERMISSION_PROFILE", entityId: id, detail: { isActive: active } });
  revalidatePath("/settings/permission-profiles");
  revalidatePath(`/settings/permission-profiles/${id}`);
  redirect(`/settings/permission-profiles/${id}`);
}

export async function deleteProfile(id: string) {
  const user = await requirePermission("permprofile:manage");
  const existing = await prisma.permissionProfile.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true, name: true } });
  if (!existing) redirect("/settings/permission-profiles");
  await prisma.permissionProfile.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await auditLog(user, { action: "DELETE", entityType: "PERMISSION_PROFILE", entityId: id, detail: { name: existing.name } });
  revalidatePath("/settings/permission-profiles");
  redirect("/settings/permission-profiles");
}
