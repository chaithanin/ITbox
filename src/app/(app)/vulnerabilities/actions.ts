"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optStr = z.preprocess(emptyToNull, z.string().max(5000).nullable().optional());
const optUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());
const optDate = z.preprocess((v) => {
  const s = emptyToNull(v);
  if (s == null) return null;
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? null : d;
}, z.date().nullable().optional());

const SEVERITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const STATUS = ["OPEN", "IN_PROGRESS", "REMEDIATED", "ACCEPTED", "FALSE_POSITIVE"] as const;

const createSchema = z.object({
  title: z.string().min(3).max(300),
  cveId: optStr,
  severity: z.enum(SEVERITY),
  assetId: optUuid,
  affectedSystem: optStr,
  description: optStr,
  remediation: optStr,
  patchAvailable: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
  patchVersion: optStr,
  dueDate: optDate,
});

export async function createVulnerability(formData: FormData) {
  const user = await requirePermission("vuln:manage");
  const i = createSchema.parse(Object.fromEntries(formData));
  const v = await prisma.vulnerability.create({
    data: {
      organizationId: user.organizationId, title: i.title.trim(), cveId: i.cveId ?? null, severity: i.severity,
      assetId: i.assetId ?? null, affectedSystem: i.affectedSystem ?? null, description: i.description ?? null,
      remediation: i.remediation ?? null, patchAvailable: i.patchAvailable ?? false, patchVersion: i.patchVersion ?? null,
      dueDate: i.dueDate ?? null, assignedToId: user.id,
    },
    select: { id: true },
  });
  await auditLog(user, { action: "CREATE", entityType: "VULNERABILITY", entityId: v.id, detail: { title: i.title, severity: i.severity } });
  revalidatePath("/vulnerabilities");
  redirect("/vulnerabilities?ok=created");
}

export async function setVulnStatus(id: string, formData: FormData) {
  const user = await requirePermission("vuln:manage");
  const status = z.enum(STATUS).parse(formData.get("status"));
  const v = await prisma.vulnerability.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true, title: true } });
  if (!v) redirect("/vulnerabilities");
  await prisma.vulnerability.update({
    where: { id },
    data: { status, ...(status === "REMEDIATED" ? { remediatedAt: new Date() } : {}) },
  });
  await auditLog(user, { action: "UPDATE", entityType: "VULNERABILITY", entityId: id, detail: { title: v.title, status } });
  revalidatePath("/vulnerabilities");
  redirect("/vulnerabilities?ok=updated");
}

export async function deleteVulnerability(formData: FormData) {
  const user = await requirePermission("vuln:manage");
  const id = z.string().uuid().parse(formData.get("id"));
  await prisma.vulnerability.updateMany({ where: { id, organizationId: user.organizationId }, data: { deletedAt: new Date() } });
  await auditLog(user, { action: "DELETE", entityType: "VULNERABILITY", entityId: id });
  revalidatePath("/vulnerabilities");
  redirect("/vulnerabilities?ok=deleted");
}
