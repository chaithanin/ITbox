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
  assetId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
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
    assetId: i.assetId ?? null,
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

/** Clean a holder token: drop honorifics (K. / คุณ / นาย…) and a trailing "-dept". */
function cleanHolder(holder: string): string {
  let h = holder.trim().toLowerCase();
  h = h.replace(/^(k\.?|k'|khun|คุณ|น\.?ส\.?|นาย|นาง(สาว)?)\s*/i, "");
  h = h.split(/[-/(]/)[0].trim();
  return h;
}

/**
 * Auto-connect existing SIM lines to their device (asset) and holder (employee)
 * using data already in each line. Only fills links that are currently empty,
 * so it never clobbers manual assignments and is safe to re-run.
 *  - device: matches "SN:xxx" / IMEI found in the line's notes to an asset's
 *    serialNumber / imei.
 *  - employee: matches the holder text to an employee name.
 */
export async function autoConnectSims() {
  const user = await requirePermission("sim:manage");
  const orgId = user.organizationId;

  const [sims, assets, employees] = await Promise.all([
    prisma.simCard.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, notes: true, holder: true, employeeId: true, assetId: true } }),
    prisma.asset.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, serialNumber: true, imei: true } }),
    prisma.employee.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, firstName: true, lastName: true } }),
  ]);

  const normSerial = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "");
  const bySerial = new Map<string, string[]>();
  const byImei = new Map<string, string[]>();
  for (const a of assets) {
    if (a.serialNumber) { const k = normSerial(a.serialNumber); if (k) (bySerial.get(k) ?? bySerial.set(k, []).get(k)!).push(a.id); }
    if (a.imei) { const k = a.imei.replace(/\D/g, ""); if (k) (byImei.get(k) ?? byImei.set(k, []).get(k)!).push(a.id); }
  }

  const empByFirst = new Map<string, string[]>();
  const empByFull = new Map<string, string[]>();
  for (const e of employees) {
    const fn = (e.firstName || "").trim().toLowerCase();
    const full = `${e.firstName || ""} ${e.lastName || ""}`.trim().toLowerCase();
    if (fn) (empByFirst.get(fn) ?? empByFirst.set(fn, []).get(fn)!).push(e.id);
    if (full) (empByFull.get(full) ?? empByFull.set(full, []).get(full)!).push(e.id);
  }

  let linkedDevice = 0, linkedEmployee = 0;

  for (const s of sims) {
    const data: { assetId?: string; employeeId?: string } = {};

    // device via SN then IMEI in notes
    if (!s.assetId && s.notes) {
      const snMatch = /SN\s*:\s*([A-Za-z0-9-]+)/i.exec(s.notes);
      if (snMatch) { const hit = bySerial.get(normSerial(snMatch[1])); if (hit && hit.length === 1) data.assetId = hit[0]; }
      if (!data.assetId) {
        const imeiMatch = /IMEI\s*:\s*([0-9]{14,16})/i.exec(s.notes);
        if (imeiMatch) { const hit = byImei.get(imeiMatch[1]); if (hit && hit.length === 1) data.assetId = hit[0]; }
      }
    }

    // employee via holder text
    if (!s.employeeId && s.holder) {
      const h = cleanHolder(s.holder);
      if (h.length >= 2) {
        const full = empByFull.get(h);
        const first = empByFirst.get(h);
        if (full && full.length === 1) data.employeeId = full[0];
        else if (first && first.length === 1) data.employeeId = first[0];
      }
    }

    if (data.assetId || data.employeeId) {
      await prisma.simCard.update({ where: { id: s.id }, data });
      if (data.assetId) linkedDevice++;
      if (data.employeeId) linkedEmployee++;
    }
  }

  await auditLog(user, { action: "UPDATE", entityType: "SIM", detail: { autoConnect: true, linkedDevice, linkedEmployee } });
  revalidatePath("/sim");
  redirect(`/sim?connected=${linkedDevice}&emp=${linkedEmployee}`);
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
