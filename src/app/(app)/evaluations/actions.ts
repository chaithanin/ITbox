"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import {
  getEvalTemplate,
  computeEvaluation,
  STAGE_KEYS,
  type EvalScores,
  type EvalTemplateKey,
} from "@/lib/documents/evaluation-templates";

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7, no DST

/** EVAL{DD}{MM}{YY}-{NN} — Bangkok-day running sequence per org. */
async function generateEvalRefNo(orgId: string, now: Date = new Date()): Promise<string> {
  const b = new Date(now.getTime() + BKK_OFFSET_MS);
  const dd = String(b.getUTCDate()).padStart(2, "0");
  const mm = String(b.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(b.getUTCFullYear() % 100).padStart(2, "0");
  const startUtc = new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - BKK_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  const count = await prisma.evaluation.count({
    where: { organizationId: orgId, createdAt: { gte: startUtc, lt: endUtc } },
  });
  return `EVAL${dd}${mm}${yy}-${String(count + 1).padStart(2, "0")}`;
}

const TEMPLATES = ["IT_SUPPORT", "IT_ASSISTANT_MANAGER"] as const;

function optDate(v: FormDataEntryValue | null): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function optStr(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Create a new evaluation for an employee from a role template. */
export async function createEvaluation(formData: FormData) {
  const user = await requirePermission("evaluation:manage");
  const employeeId = z.string().uuid().parse(formData.get("employeeId"));
  const template = z.enum(TEMPLATES).parse(formData.get("template")) as EvalTemplateKey;

  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId: user.organizationId, deletedAt: null },
    include: { department: { select: { name: true } } },
  });
  if (!emp) redirect("/evaluations/new?error=emp");

  const reviewPeriodStart = optDate(formData.get("reviewPeriodStart")) ?? emp.startDate ?? null;
  const probationEndDate = optDate(formData.get("probationEndDate"))
    ?? (reviewPeriodStart ? new Date(reviewPeriodStart.getTime() + 90 * 24 * 60 * 60 * 1000) : null);

  const refNo = await generateEvalRefNo(user.organizationId);
  const e = await prisma.evaluation.create({
    data: {
      organizationId: user.organizationId,
      employeeId: emp.id,
      template,
      status: "DRAFT",
      refNo,
      employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
      position: emp.position ?? null,
      department: emp.department?.name ?? null,
      reviewPeriodStart,
      probationEndDate,
      currentStage: "d30",
      scores: {},
      createdById: user.id,
      reviewerName: user.name ?? null,
      reviewerId: user.id,
    },
    select: { id: true },
  });
  await auditLog(user, {
    action: "CREATE",
    entityType: "EVALUATION",
    entityId: e.id,
    detail: { template, employee: `${emp.firstName} ${emp.lastName}`, refNo },
  });
  revalidatePath("/evaluations");
  redirect(`/evaluations/${e.id}?ok=created`);
}

/** Save scores + comments; recompute overall + grade. */
export async function saveEvaluation(id: string, formData: FormData) {
  const user = await requirePermission("evaluation:manage");
  const ev = await prisma.evaluation.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, template: true },
  });
  if (!ev) redirect("/evaluations");
  const template = getEvalTemplate(ev.template);
  if (!template) redirect(`/evaluations/${id}`);

  // Collect per-KPI stage scores + note from the form.
  const scores: EvalScores = {};
  for (const kpi of template.kpis) {
    const entry: { d30?: number | null; d60?: number | null; d90?: number | null; note?: string } = {};
    for (const stage of STAGE_KEYS) {
      const raw = formData.get(`score_${kpi.key}_${stage}`);
      const n = typeof raw === "string" ? Number(raw) : NaN;
      entry[stage] = Number.isFinite(n) && n >= 1 && n <= template.scaleMax ? Math.round(n) : null;
    }
    const note = optStr(formData.get(`note_${kpi.key}`));
    if (note) entry.note = note;
    scores[kpi.key] = entry;
  }

  const computed = computeEvaluation(template, scores);
  const status = z.enum(["DRAFT", "IN_REVIEW", "COMPLETED"]).catch("DRAFT").parse(formData.get("status"));
  const currentStage = z.enum(["d30", "d60", "d90"]).catch("d30").parse(formData.get("currentStage"));

  await prisma.evaluation.update({
    where: { id },
    data: {
      scores: scores as object,
      overallScore: computed.overall,
      grade: computed.grade?.label ?? null,
      currentStage,
      status,
      reviewerName: optStr(formData.get("reviewerName")),
      managerComment: optStr(formData.get("managerComment")),
      employeeComment: optStr(formData.get("employeeComment")),
      actionPlan: optStr(formData.get("actionPlan")),
      reviewPeriodStart: optDate(formData.get("reviewPeriodStart")),
      probationEndDate: optDate(formData.get("probationEndDate")),
      completedAt: status === "COMPLETED" ? new Date() : null,
    },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "EVALUATION",
    entityId: id,
    detail: { status, overall: computed.overall != null ? Math.round(computed.overall) : null, grade: computed.grade?.label ?? null },
  });
  revalidatePath(`/evaluations/${id}`);
  revalidatePath("/evaluations");
  redirect(`/evaluations/${id}?ok=saved`);
}

/** Soft-delete an evaluation. */
export async function deleteEvaluation(id: string) {
  const user = await requirePermission("evaluation:manage");
  const ev = await prisma.evaluation.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!ev) redirect("/evaluations");
  await prisma.evaluation.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, { action: "DELETE", entityType: "EVALUATION", entityId: id });
  revalidatePath("/evaluations");
  redirect("/evaluations?ok=deleted");
}
