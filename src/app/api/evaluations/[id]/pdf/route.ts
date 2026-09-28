import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  buildEvaluationPdf,
  buildEvaluationNoticePdf,
  type EvalPdfData,
  type EvalPdfKpiRow,
  type EvalPdfCatRow,
  type EvalNoticeData,
} from "@/lib/documents/pdf";
import {
  getEvalTemplate,
  computeEvaluation,
  categoryScore,
  STAGE_LABEL,
  SCALE_LEGEND,
  type EvalScores,
  type StageKey,
} from "@/lib/documents/evaluation-templates";

export const dynamic = "force-dynamic";

const ddmmyyyy = (d: Date | null | undefined): string | undefined =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : undefined;

/**
 * GET /api/evaluations/[id]/pdf         → the filled 30/60/90 assessment
 * GET /api/evaluations/[id]/pdf?doc=notice → the goal-notification letter
 */
export const GET = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission("evaluation:read");
  const { id } = await ctx.params;
  const doc = new URL(req.url).searchParams.get("doc");
  const ev = await prisma.evaluation.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!ev) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const template = getEvalTemplate(ev.template);
  if (!template) return NextResponse.json({ error: "bad_template" }, { status: 400 });

  // ── Goal-notification letter ──────────────────────────────────────────────
  if (doc === "notice") {
    const data: EvalNoticeData = {
      refNo: ev.refNo ?? undefined,
      roleLabel: template.role,
      employeeName: ev.employeeName ?? undefined,
      startDate: ddmmyyyy(ev.reviewPeriodStart),
      stages: template.stages.map((s) => ({ label: s.label, focus: s.question, outcome: s.outcome })),
      kpis: template.kpis.map((k) => ({ no: k.no, label: `${k.labelTh} / ${k.label}`, d30: k.d30, d60: k.d60, d90: k.d90 })),
      numericKpis: template.numericKpis,
      categories: template.categories.map((c) => ({
        label: c.label,
        kpiNos: c.kpiKeys.map((kk) => template.kpis.find((k) => k.key === kk)?.no).filter(Boolean).join(", "),
        weight: c.weight,
      })),
      managerChecklist: template.managerChecklist,
      grades: template.grades.map((g) => ({ range: g.min >= 90 ? "90–100" : `${g.min}–${g.min + 9}`, label: g.label, th: g.labelTh })),
      passMark: template.passMark,
    };
    const pdf = await buildEvaluationNoticePdf(data);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="notice-${ev.refNo || id.slice(0, 8)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // ── Filled assessment ─────────────────────────────────────────────────────
  const scores = (ev.scores ?? {}) as EvalScores;
  const computed = computeEvaluation(template, scores);
  const sc = (kpiKey: string, stage: StageKey): string => {
    const v = scores[kpiKey]?.[stage];
    return typeof v === "number" && v >= 1 ? String(v) : "-";
  };
  const kpis: EvalPdfKpiRow[] = template.kpis.map((k) => ({
    no: k.no,
    label: `${k.labelTh} / ${k.label}`,
    category: template.categories.find((c) => c.key === k.category)?.label ?? "",
    s30: sc(k.key, "d30"), s60: sc(k.key, "d60"), s90: sc(k.key, "d90"),
  }));
  const fmtAvg = (v: number | undefined) => (v != null ? v.toFixed(1) : "-");
  const fmtCat = (c: (typeof template.categories)[number], stage: StageKey) => {
    const s = categoryScore(template, c, computed.categoryAvg[c.key]?.[stage]);
    return s != null ? s.toFixed(1) : "-";
  };
  const categories: EvalPdfCatRow[] = template.categories.map((c) => ({
    label: c.label, weight: c.weight,
    a30: fmtAvg(computed.categoryAvg[c.key]?.d30), a60: fmtAvg(computed.categoryAvg[c.key]?.d60), a90: fmtAvg(computed.categoryAvg[c.key]?.d90),
    c30: fmtCat(c, "d30"), c60: fmtCat(c, "d60"), c90: fmtCat(c, "d90"),
  }));
  const roundStr = (stage: StageKey) => {
    const r = computed.rounds[stage];
    return { total: r.total != null ? String(Math.round(r.total)) : "-", grade: r.grade?.label ?? "" };
  };

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
    rounds: { d30: roundStr("d30"), d60: roundStr("d60"), d90: roundStr("d90") },
    finalStageLabel: computed.finalStage ? STAGE_LABEL[computed.finalStage] : undefined,
    overall: computed.overall != null ? String(Math.round(computed.overall)) : "-",
    grade: computed.grade?.label,
    kpis,
    categories,
    numericKpis: template.numericKpis,
    managerChecklist: template.managerChecklist,
    managerComment: ev.managerComment ?? undefined,
    employeeComment: ev.employeeComment ?? undefined,
    actionPlan: ev.actionPlan ?? undefined,
    improvementNote: ev.improvementNote ?? undefined,
    probationResult: ev.probationResult ?? undefined,
    probationEffectiveFrom: ddmmyyyy(ev.probationEffectiveFrom),
    decisionNote: ev.decisionNote ?? undefined,
    reviewerName: ev.reviewerName ?? undefined,
    scaleLegend: SCALE_LEGEND,
    passMark: template.passMark,
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
