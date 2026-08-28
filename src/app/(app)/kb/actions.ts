"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import type { KbStatus } from "@prisma/client";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optStr = z.preprocess(emptyToNull, z.string().max(200).nullable().optional());

const schema = z.object({
  title: z.string().min(3).max(300),
  category: optStr,
  tags: optStr,
  body: z.string().min(1).max(50000),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});

export async function createArticle(formData: FormData) {
  const user = await requirePermission("kb:manage");
  const i = schema.parse(Object.fromEntries(formData));
  const a = await prisma.kbArticle.create({
    data: { organizationId: user.organizationId, title: i.title.trim(), category: i.category ?? null, tags: i.tags ?? null, body: i.body, status: i.status, authorId: user.id },
    select: { id: true },
  });
  await auditLog(user, { action: "CREATE", entityType: "KB_ARTICLE", entityId: a.id, detail: { title: i.title } });
  revalidatePath("/kb");
  redirect(`/kb/${a.id}`);
}

export async function updateArticle(id: string, formData: FormData) {
  const user = await requirePermission("kb:manage");
  const i = schema.parse(Object.fromEntries(formData));
  const a = await prisma.kbArticle.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true } });
  if (!a) redirect("/kb");
  await prisma.kbArticle.update({ where: { id }, data: { title: i.title.trim(), category: i.category ?? null, tags: i.tags ?? null, body: i.body, status: i.status } });
  await auditLog(user, { action: "UPDATE", entityType: "KB_ARTICLE", entityId: id, detail: { title: i.title } });
  revalidatePath("/kb");
  revalidatePath(`/kb/${id}`);
  redirect(`/kb/${id}?ok=1`);
}

export async function setStatus(id: string, status: KbStatus) {
  const user = await requirePermission("kb:manage");
  const a = await prisma.kbArticle.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true } });
  if (!a) redirect("/kb");
  await prisma.kbArticle.update({ where: { id }, data: { status } });
  revalidatePath("/kb");
  revalidatePath(`/kb/${id}`);
  redirect(`/kb/${id}?ok=status`);
}

export async function deleteArticle(formData: FormData) {
  const user = await requirePermission("kb:manage");
  const id = z.string().uuid().parse(formData.get("id"));
  await prisma.kbArticle.updateMany({ where: { id, organizationId: user.organizationId }, data: { deletedAt: new Date() } });
  await auditLog(user, { action: "DELETE", entityType: "KB_ARTICLE", entityId: id });
  revalidatePath("/kb");
  redirect("/kb");
}
