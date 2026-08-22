"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { safeUrl } from "@/lib/signature";

const linkSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().min(1).max(500),
  icon: z.string().trim().max(200).optional().default(""),
});

const profileSchema = z.object({
  templateId: z.string().uuid().nullable().optional(),
  fullName: z.string().trim().min(1).max(120),
  position: z.string().trim().max(150).optional().default(""),
  department: z.string().trim().max(150).optional().default(""),
  mobilePhone: z.string().trim().max(50).optional().default(""),
  officePhone: z.string().trim().max(50).optional().default(""),
  extension: z.string().trim().max(20).optional().default(""),
  email: z.string().trim().max(200).optional().default(""),
  website: z.string().trim().max(300).optional().default(""),
  address: z.string().trim().max(400).optional().default(""),
  logoUrl: z.string().trim().max(1000).optional().default(""),
  companyLinks: z.array(linkSchema).max(20).optional().default([]),
});

export type SaveSignatureInput = z.infer<typeof profileSchema>;

const nul = (s: string | undefined | null) => (s && s.trim() !== "" ? s.trim() : null);

export async function saveSignatureAction(
  input: SaveSignatureInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง / Invalid data" };
  const d = parsed.data;

  // Validate URLs (website, logo, each company link) — reject unsafe.
  if (d.website && !safeUrl(d.website)) return { ok: false, error: "Website URL ไม่ถูกต้อง / Invalid website URL" };
  if (d.logoUrl && !safeUrl(d.logoUrl)) return { ok: false, error: "Logo URL ไม่ถูกต้อง / Invalid logo URL" };
  const links = [];
  for (const l of d.companyLinks) {
    if (!safeUrl(l.url)) return { ok: false, error: `URL ของ "${l.name}" ไม่ถูกต้อง / Invalid URL` };
    links.push({ name: l.name, url: safeUrl(l.url)!, icon: l.icon || undefined });
  }

  // Template must belong to the org (or null).
  let templateId: string | null = null;
  if (d.templateId) {
    const t = await prisma.signatureTemplate.findFirst({
      where: { id: d.templateId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    templateId = t?.id ?? null;
  }

  const data = {
    templateId,
    fullName: d.fullName,
    position: nul(d.position),
    department: nul(d.department),
    mobilePhone: nul(d.mobilePhone),
    officePhone: nul(d.officePhone),
    extension: nul(d.extension),
    email: nul(d.email),
    website: nul(d.website),
    address: nul(d.address),
    logoUrl: nul(d.logoUrl),
    companyLinks: links,
  };

  await prisma.signatureProfile.upsert({
    where: { userId: user.id },
    create: { organizationId: user.organizationId, userId: user.id, ...data },
    update: data,
  });

  await auditLog(user, { action: "UPDATE", entityType: "SIGNATURE_PROFILE", entityId: user.id });
  revalidatePath("/support/signature");
  return { ok: true };
}

export async function resetSignatureAction(): Promise<{ ok: true }> {
  const user = await requireUser();
  await prisma.signatureProfile.deleteMany({ where: { userId: user.id } });
  revalidatePath("/support/signature");
  return { ok: true };
}
