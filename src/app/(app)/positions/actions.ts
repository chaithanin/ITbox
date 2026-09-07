"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "IT_ADMIN"] as const;
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const schema = z.object({
  name: z.string().min(1).max(120),
  code: z.preprocess(emptyToNull, z.string().max(40).nullable().optional()),
  departmentId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  jobLevel: z.preprocess((v) => (typeof v === "string" && (LEVELS as readonly string[]).includes(v) ? v : null), z.enum(LEVELS).nullable().optional()),
  isActive: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
});

function data(i: z.infer<typeof schema>) {
  return {
    name: i.name.trim(),
    code: i.code ?? null,
    departmentId: i.departmentId ?? null,
    jobLevel: i.jobLevel ?? null,
    isActive: i.isActive,
  };
}

export async function createPosition(formData: FormData) {
  const user = await requirePermission("permprofile:manage");
  const input = schema.parse(Object.fromEntries(formData));
  const p = await prisma.position.create({ data: { organizationId: user.organizationId, ...data(input) } });
  await auditLog(user, { action: "CREATE", entityType: "POSITION", entityId: p.id, detail: { name: p.name } });
  revalidatePath("/positions");
  redirect("/positions");
}

export async function updatePosition(id: string, formData: FormData) {
  const user = await requirePermission("permprofile:manage");
  const existing = await prisma.position.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true } });
  if (!existing) redirect("/positions");
  const input = schema.parse(Object.fromEntries(formData));
  await prisma.position.update({ where: { id }, data: data(input) });
  await auditLog(user, { action: "UPDATE", entityType: "POSITION", entityId: id, detail: { name: input.name } });
  revalidatePath("/positions");
  redirect("/positions");
}

export async function deletePosition(id: string) {
  const user = await requirePermission("permprofile:manage");
  const existing = await prisma.position.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true, name: true } });
  if (!existing) redirect("/positions");
  await prisma.position.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  await auditLog(user, { action: "DELETE", entityType: "POSITION", entityId: id, detail: { name: existing.name } });
  revalidatePath("/positions");
  redirect("/positions");
}
