"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { safeUrl } from "@/lib/signature";

const templateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  companyName: z.string().trim().max(200).optional().default(""),
  logoUrl: z.string().trim().max(1000).optional().default(""),
  primaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#24386F"),
  secondaryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().default("#6b7280"),
  fontFamily: z.string().trim().max(120).optional().default("Arial, Helvetica, sans-serif"),
  fontSize: z.coerce.number().int().min(9).max(20).optional().default(13),
  dividerStyle: z.enum(["solid", "dashed", "none"]).optional().default("solid"),
  defaultLinks: z.string().optional().default(""), // "Name|https://url" per line
  isDefault: z.string().optional(),
});

function parseLinks(raw: string): { name: string; url: string }[] {
  const out: { name: string; url: string }[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const [name, url] = line.split("|").map((s) => s.trim());
    const safe = url ? safeUrl(url) : null;
    if (name && safe) out.push({ name, url: safe });
  }
  return out;
}

export async function createTemplateAction(formData: FormData) {
  const user = await requirePermission("support:settings");
  const p = templateSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) redirect("/settings/signature?error=invalid");
  const d = p.data;
  if (d.logoUrl && !safeUrl(d.logoUrl)) redirect("/settings/signature?error=logo");

  const isDefault = d.isDefault === "on";
  await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.signatureTemplate.updateMany({
        where: { organizationId: user.organizationId, isDefault: true },
        data: { isDefault: false },
      });
    }
    const count = await tx.signatureTemplate.count({ where: { organizationId: user.organizationId } });
    await tx.signatureTemplate.create({
      data: {
        organizationId: user.organizationId,
        name: d.name,
        companyName: d.companyName || null,
        logoUrl: d.logoUrl || null,
        primaryColor: d.primaryColor,
        secondaryColor: d.secondaryColor,
        fontFamily: d.fontFamily,
        fontSize: d.fontSize,
        dividerStyle: d.dividerStyle,
        defaultLinks: parseLinks(d.defaultLinks),
        isDefault: isDefault || count === 0,
      },
    });
  });
  await auditLog(user, { action: "CREATE", entityType: "SIGNATURE_TEMPLATE" });
  revalidatePath("/settings/signature");
  redirect("/settings/signature?ok=created");
}

export async function setDefaultTemplateAction(id: string) {
  const user = await requirePermission("support:settings");
  const t = await prisma.signatureTemplate.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!t) redirect("/settings/signature?error=notfound");
  await prisma.$transaction([
    prisma.signatureTemplate.updateMany({
      where: { organizationId: user.organizationId, isDefault: true },
      data: { isDefault: false },
    }),
    prisma.signatureTemplate.update({ where: { id }, data: { isDefault: true } }),
  ]);
  revalidatePath("/settings/signature");
  redirect("/settings/signature?ok=default");
}

export async function deleteTemplateAction(id: string) {
  const user = await requirePermission("support:settings");
  const t = await prisma.signatureTemplate.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!t) redirect("/settings/signature?error=notfound");
  await prisma.signatureTemplate.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
  await auditLog(user, { action: "DELETE", entityType: "SIGNATURE_TEMPLATE", entityId: id });
  revalidatePath("/settings/signature");
  redirect("/settings/signature?ok=deleted");
}
