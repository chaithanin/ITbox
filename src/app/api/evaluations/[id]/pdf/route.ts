import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildEvaluationPdf, type EvalPdfData, type EvalPdfKpi } from "@/lib/documents/pdf";
import {
  getEvalTemplate,
  computeEvaluation,
  STAGE_LABEL,
  type EvalScores,
  type StageKey,
} from "@/lib/documents/evaluation-templates";

export const dynamic = "force-dynamic";

const ddmmyyyy = (d: Date | null | undefined): string | undefined =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : undefined;

/**
 * GET /api/evaluations/[id]/pdf
 * Renders a saved probation 30/60/90 KPI evaluation as an A4 document.
 */
export const GET = apiHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission("evaluation:read");
  const { id } = await ctx.params;
  const ev = await prisma.evaluation.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!ev) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const template = getEvalTemplate(ev.template);
  if (!template) return NextResponse.json({ error: "bad_template" }, { status: 400 });

  const scores = (ev.scores ?? {}) as EvalScores;
  const computed = computeEvaluation(template, scores);
  const percentByKpi = new Map(computed.perKpi.map((k) => [k.key, k.percent]));
  const sc = (kpiKey: string, stage: StageKey): string => {
    const v = scores[kpiKey]?.[stage];
    return typeof v === "number" && v >= 1 ? String(v) : "-";
  };

  const kpis: EvalPdfKpi[] = template.kpis.map((k, i) => {
    const pct = percentByKpi.get(k.key);
    return {
      index: i + 1,
      label: `${k.labelTh} / ${k.label}`,
      weight: k.weight,
      target: k.target,
      s30: sc(k.key, "d30"),
      s60: sc(k.key, "d60"),
      s90: sc(k.key, "d90"),
      percent: pct != null ? `${Math.round(pct)}%` : "",
      note: scores[k.key]?.note ?? "",
    };
  });

  const data: EvalPdfData = {
    refNo: ev.refNo ?? undefined,
    title: template.title,
    subtitle: template.subtitle,
    roleLabel: template.role,
    employeeName: ev.employeeName ?? undefined,
    position: ev.position ?? undefined,
    department: ev.department ?? undefined,
    reviewPeriodStart: ddmmyyyy(ev.reviewPeriodStart),
    probationEndDate: ddmmyyyy(ev.probationEndDate),
    currentStage: ev.currentStage ? STAGE_LABEL[ev.currentStage as StageKey] ?? ev.currentStage : undefined,
    status: ev.status,
    overall: ev.overallScore != null ? String(Math.round(ev.overallScore)) : "—",
    grade: ev.grade ?? undefined,
    stageWeights: `น้ำหนักช่วง: 30 วัน ${template.stageWeights.d30}% · 60 วัน ${template.stageWeights.d60}% · 90 วัน ${template.stageWeights.d90}%`,
    scaleLegend: "คะแนน 1=ไม่ผ่าน..5=ดีเยี่ยม",
    kpis,
    numericKpis: template.numericKpis,
    managerChecklist: template.managerChecklist,
    managerComment: ev.managerComment ?? undefined,
    employeeComment: ev.employeeComment ?? undefined,
    actionPlan: ev.actionPlan ?? undefined,
    reviewerName: ev.reviewerName ?? undefined,
  };

  const pdf = await buildEvaluationPdf(data);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="evaluation-${ev.refNo || id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
