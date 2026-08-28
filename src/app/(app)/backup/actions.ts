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

const TYPES = ["FULL", "INCREMENTAL", "DIFFERENTIAL", "SNAPSHOT"] as const;
const STATUSES = ["OK", "WARNING", "FAILED", "NOT_RUN"] as const;

const createSchema = z.object({
  system: z.string().min(1).max(200),
  backupType: z.enum(TYPES),
  schedule: optStr, storageTarget: optStr, owner: optStr,
  retentionDays: optInt, rpoHours: optInt, rtoHours: optInt,
});

export async function createBackupJob(formData: FormData) {
  const user = await requirePermission("backup:manage");
  const i = createSchema.parse(Object.fromEntries(formData));
  try {
    const j = await prisma.backupJob.create({
      data: {
        organizationId: user.organizationId, system: i.system.trim(), backupType: i.backupType,
        schedule: i.schedule ?? null, storageTarget: i.storageTarget ?? null, owner: i.owner ?? null,
        retentionDays: i.retentionDays ?? null, rpoHours: i.rpoHours ?? null, rtoHours: i.rtoHours ?? null,
      },
    });
    await auditLog(user, { action: "CREATE", entityType: "BACKUP_JOB", entityId: j.id, detail: { system: j.system } });
  } catch {
    redirect("/backup?error=dup");
  }
  revalidatePath("/backup");
  redirect("/backup?ok=created");
}

export async function recordRun(id: string, formData: FormData) {
  const user = await requirePermission("backup:manage");
  const status = z.enum(STATUSES).parse(formData.get("status"));
  const job = await prisma.backupJob.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true, system: true } });
  if (!job) redirect("/backup");
  await prisma.backupJob.update({ where: { id }, data: { lastStatus: status, lastRunAt: new Date() } });
  await auditLog(user, { action: "UPDATE", entityType: "BACKUP_JOB", entityId: id, detail: { system: job.system, lastStatus: status } });
  revalidatePath("/backup");
  redirect("/backup?ok=run");
}

export async function recordRestoreTest(id: string, formData: FormData) {
  const user = await requirePermission("backup:manage");
  const result = z.enum(["PASS", "FAIL"]).parse(formData.get("result"));
  const note = z.preprocess(emptyToNull, z.string().max(500).nullable().optional()).parse(formData.get("note"));
  const job = await prisma.backupJob.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true, system: true } });
  if (!job) redirect("/backup");
  await prisma.backupJob.update({
    where: { id },
    data: { lastRestoreTestAt: new Date(), restoreResult: `${result}${note ? ` — ${note}` : ""}` },
  });
  await auditLog(user, { action: "UPDATE", entityType: "BACKUP_JOB", entityId: id, detail: { system: job.system, restoreTest: result } });
  revalidatePath("/backup");
  redirect("/backup?ok=restore");
}

export async function deleteBackupJob(formData: FormData) {
  const user = await requirePermission("backup:manage");
  const id = z.string().uuid().parse(formData.get("id"));
  await prisma.backupJob.updateMany({ where: { id, organizationId: user.organizationId }, data: { deletedAt: new Date() } });
  await auditLog(user, { action: "DELETE", entityType: "BACKUP_JOB", entityId: id });
  revalidatePath("/backup");
  redirect("/backup?ok=deleted");
}
