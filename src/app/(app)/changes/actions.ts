"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import type { ChangeStatus } from "@prisma/client";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optStr = z.preprocess(emptyToNull, z.string().max(5000).nullable().optional());
const optDate = z.preprocess((v) => {
  const s = emptyToNull(v);
  if (s == null) return null;
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? null : d;
}, z.date().nullable().optional());

const RISKS = ["LOW", "MEDIUM", "HIGH"] as const;

// Allowed status transitions for the change lifecycle.
const NEXT: Record<ChangeStatus, ChangeStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["APPROVED", "REJECTED"],
  APPROVED: ["SCHEDULED", "IMPLEMENTED"],
  REJECTED: ["DRAFT"],
  SCHEDULED: ["IMPLEMENTED", "FAILED"],
  IMPLEMENTED: ["CLOSED", "ROLLED_BACK"],
  FAILED: ["ROLLED_BACK", "SCHEDULED", "CLOSED"],
  ROLLED_BACK: ["CLOSED"],
  CLOSED: [],
};

async function nextChangeNumber(organizationId: string, year: number): Promise<string> {
  const prefix = `CHG-${year}-`;
  const count = await prisma.changeRequest.count({ where: { organizationId, changeNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

const createSchema = z.object({
  title: z.string().min(3).max(300),
  description: optStr,
  risk: z.enum(RISKS),
  impact: optStr,
  rollbackPlan: optStr,
  testPlan: optStr,
  scheduledStart: optDate,
  scheduledEnd: optDate,
});

export async function createChange(formData: FormData) {
  const user = await requirePermission("change:manage");
  const i = createSchema.parse(Object.fromEntries(formData));
  let created: { id: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    const changeNumber = await nextChangeNumber(user.organizationId, new Date().getFullYear());
    try {
      created = await prisma.changeRequest.create({
        data: {
          organizationId: user.organizationId, changeNumber, title: i.title.trim(),
          description: i.description ?? null, risk: i.risk, impact: i.impact ?? null,
          rollbackPlan: i.rollbackPlan ?? null, testPlan: i.testPlan ?? null,
          scheduledStart: i.scheduledStart ?? null, scheduledEnd: i.scheduledEnd ?? null,
          requestedById: user.id, status: "DRAFT",
        },
        select: { id: true },
      });
    } catch (e) {
      if (!(typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002")) throw e;
    }
  }
  if (!created) throw new Error("Could not allocate change number");
  await auditLog(user, { action: "CREATE", entityType: "CHANGE_REQUEST", entityId: created.id, detail: { title: i.title } });
  revalidatePath("/changes");
  redirect(`/changes/${created.id}`);
}

export async function transitionChange(id: string, to: ChangeStatus, formData: FormData) {
  // Approve/reject require the dedicated approval permission; everything else
  // needs change:manage. High-risk changes therefore cannot self-approve.
  const needsApprove = to === "APPROVED" || to === "REJECTED";
  const user = await requirePermission(needsApprove ? "change:approve" : "change:manage");
  const reason = z.preprocess(emptyToNull, z.string().max(1000).nullable().optional()).parse(formData.get("reason"));

  const cr = await prisma.changeRequest.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, status: true, changeNumber: true },
  });
  if (!cr) redirect("/changes");
  if (!NEXT[cr.status].includes(to)) redirect(`/changes/${id}?error=transition`);

  const data: Record<string, unknown> = { status: to };
  if (to === "APPROVED") { data.approvedById = user.id; data.approvedAt = new Date(); data.rejectReason = null; }
  if (to === "REJECTED") { data.rejectReason = reason ?? "Rejected"; }
  if (to === "IMPLEMENTED") { data.implementedAt = new Date(); }

  await prisma.changeRequest.update({ where: { id }, data });
  await auditLog(user, { action: "UPDATE", entityType: "CHANGE_REQUEST", entityId: id, detail: { changeNumber: cr.changeNumber, from: cr.status, to, reason: reason ?? undefined } });
  revalidatePath("/changes");
  revalidatePath(`/changes/${id}`);
  redirect(`/changes/${id}?ok=1`);
}
