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
const optNum = z.preprocess((v) => {
  const s = emptyToNull(v);
  return s == null ? null : Number(s);
}, z.number().min(0).nullable().optional());
const optDate = z.preprocess((v) => {
  const s = emptyToNull(v);
  if (s == null) return null;
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? null : d;
}, z.date().nullable().optional());

const STATUSES = ["ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED"] as const;

const schema = z.object({
  contractNumber: z.string().min(1).max(100),
  title: z.string().min(1).max(300),
  vendorId: optUuid,
  service: optStr,
  startDate: optDate, endDate: optDate, renewalDate: optDate,
  autoRenew: z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
  cost: optNum, slaTerms: optStr, owner: optStr, status: z.enum(STATUSES),
});

export async function createContract(formData: FormData) {
  const user = await requirePermission("contract:manage");
  const i = schema.parse(Object.fromEntries(formData));
  try {
    const c = await prisma.contract.create({
      data: {
        organizationId: user.organizationId, contractNumber: i.contractNumber.trim(), title: i.title.trim(),
        vendorId: i.vendorId ?? null, service: i.service ?? null,
        startDate: i.startDate ?? null, endDate: i.endDate ?? null, renewalDate: i.renewalDate ?? null,
        autoRenew: i.autoRenew ?? false, cost: i.cost ?? null, slaTerms: i.slaTerms ?? null,
        owner: i.owner ?? null, status: i.status,
      },
    });
    await auditLog(user, { action: "CREATE", entityType: "CONTRACT", entityId: c.id, detail: { contractNumber: c.contractNumber } });
  } catch {
    redirect("/contracts?error=dup");
  }
  revalidatePath("/contracts");
  redirect("/contracts?ok=created");
}

export async function setContractStatus(id: string, formData: FormData) {
  const user = await requirePermission("contract:manage");
  const status = z.enum(STATUSES).parse(formData.get("status"));
  const c = await prisma.contract.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true, contractNumber: true } });
  if (!c) redirect("/contracts");
  await prisma.contract.update({ where: { id }, data: { status } });
  await auditLog(user, { action: "UPDATE", entityType: "CONTRACT", entityId: id, detail: { contractNumber: c.contractNumber, status } });
  revalidatePath("/contracts");
  redirect("/contracts?ok=updated");
}

export async function deleteContract(formData: FormData) {
  const user = await requirePermission("contract:manage");
  const id = z.string().uuid().parse(formData.get("id"));
  await prisma.contract.updateMany({ where: { id, organizationId: user.organizationId }, data: { deletedAt: new Date() } });
  await auditLog(user, { action: "DELETE", entityType: "CONTRACT", entityId: id });
  revalidatePath("/contracts");
  redirect("/contracts?ok=deleted");
}
