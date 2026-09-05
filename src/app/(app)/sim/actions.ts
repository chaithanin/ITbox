"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optStr = z.preprocess(emptyToNull, z.string().max(2000).nullable().optional());

const STATUSES = ["ACTIVE", "UNUSED", "SUSPENDED", "TERMINATED"] as const;

const schema = z.object({
  phoneNumber: z.string().min(3).max(40),
  carrier: z.string().min(1).max(40),
  accountName: optStr,
  holder: optStr,
  employeeId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  departmentId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  status: z.preprocess((v) => (typeof v === "string" && (STATUSES as readonly string[]).includes(v) ? v : "ACTIVE"),
    z.enum(STATUSES)),
  simSerial: optStr,
  plan: optStr,
  monthlyFee: z.preprocess((v) => { const s = emptyToNull(v); return s == null ? null : Number(s); },
    z.number().min(0).nullable().optional()),
  startDate: z.preprocess((v) => { const s = emptyToNull(v); return s == null ? null : new Date(String(s)); },
    z.date().nullable().optional()),
  notes: optStr,
});

function toData(i: z.infer<typeof schema>) {
  return {
    phoneNumber: i.phoneNumber.trim(),
    carrier: i.carrier.trim(),
    accountName: i.accountName ?? null,
    holder: i.holder ?? null,
    employeeId: i.employeeId ?? null,
    departmentId: i.departmentId ?? null,
    status: i.status,
    simSerial: i.simSerial ?? null,
    plan: i.plan ?? null,
    monthlyFee: i.monthlyFee ?? null,
    startDate: i.startDate ?? null,
    notes: i.notes ?? null,
  };
}

export async function createSim(formData: FormData) {
  const user = await requirePermission("sim:manage");
  const input = schema.parse(Object.fromEntries(formData));
  try {
    const sim = await prisma.simCard.create({ data: { organizationId: user.organizationId, ...toData(input) } });
    await auditLog(user, { action: "CREATE", entityType: "SIM", entityId: sim.id, detail: { phoneNumber: sim.phoneNumber } });
    revalidatePath("/sim");
    redirect(`/sim/${sim.id}`);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      redirect("/sim/new?error=duplicate");
    }
    throw e;
  }
}

export async function updateSim(id: string, formData: FormData) {
  const user = await requirePermission("sim:manage");
  const input = schema.parse(Object.fromEntries(formData));
  const existing = await prisma.simCard.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true } });
  if (!existing) redirect("/sim");
  try {
    await prisma.simCard.update({ where: { id }, data: toData(input) });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      redirect(`/sim/${id}?error=duplicate`);
    }
    throw e;
  }
  await auditLog(user, { action: "UPDATE", entityType: "SIM", entityId: id, detail: { phoneNumber: input.phoneNumber } });
  revalidatePath("/sim");
  revalidatePath(`/sim/${id}`);
  redirect(`/sim/${id}`);
}

export async function deleteSim(id: string) {
  const user = await requirePermission("sim:manage");
  const existing = await prisma.simCard.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true, phoneNumber: true } });
  if (!existing) redirect("/sim");
  await prisma.simCard.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, { action: "DELETE", entityType: "SIM", entityId: id, detail: { phoneNumber: existing.phoneNumber } });
  revalidatePath("/sim");
  redirect("/sim");
}
