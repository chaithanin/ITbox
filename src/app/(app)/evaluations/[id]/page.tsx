import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import {
  getEvalTemplate,
  computeEvaluation,
  STAGE_KEYS,
  STAGE_LABEL,
  type StageKey,
  type EvalScores,
} from "@/lib/documents/evaluation-templates";
import { saveEvaluation, deleteEvaluation } from "../actions";

const STATUSES = ["DRAFT", "IN_REVIEW", "COMPLETED"] as const;
const SCALE_LEGEND = "1 = ไม่ผ่าน · 2 = ต้องปรับปรุง · 3 = พอใช้ · 4 = ดี · 5 = ดีเยี่ยม";

function gradeTone(grade: string | null | undefined): string {
  if (!grade) return "text-muted-foreground";
  if (grade.startsWith("Exceeds")) return "text-emerald-600 dark:text-emerald-400";
  if (grade.startsWith("Meets")) return "text-blue-600 dark:text-blue-400";
  if (grade.startsWith("Needs")) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}
function dateInputValue(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export default async function EvaluationDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("evaluation:read");
  const { id } = await params;
  const sp = await searchParams;
  const canManage = user.permissions.has("evaluation:manage");

  const ev = await prisma.evaluation.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!ev) notFound();
  const template = getEvalTemplate(ev.template);
  if (!template) notFound();

  const scores = (ev.scores ?? {}) as EvalScores;
  const computed = computeEvaluation(template, scores);
  const percentByKpi = new Map(computed.perKpi.map((k) => [k.key, k.percent]));
  const save = saveEvaluation.bind(null, ev.id);
  const del = deleteEvaluation.bind(null, ev.id);
  const readOnly = !canManage;

  const scoreOf = (kpiKey: string, stage: StageKey): string => {
    const v = scores[kpiKey]?.[stage];
    return typeof v === "number" && v >= 1 ? String(v) : "";
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/evaluations"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader
        title={`${ev.employeeName || "—"} — ${template.role}`}
        description={[ev.refNo, ev.department, ev.position].filter(Boolean).join(" · ") || template.subtitle}
      >
        <Button variant="outline" asChild><a href={`/api/evaluations/${ev.id}/pdf`} target="_blank" rel="noopener"><FileText className="h-4 w-4" /> พิมพ์ / PDF</a></Button>
        <StatusBadge status={ev.status} />
      </PageHeader>

      {sp.ok === "created" && <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">สร้างแบบประเมินแล้ว / Assessment created</div>}
      {sp.ok === "saved" && <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">บันทึกเรียบร้อย / Saved</div>}

      {/* Score summary */}
      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">คะแนนรวม / Overall</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-bold tabular-nums">{ev.overallScore != null ? Math.round(ev.overallScore) : "—"}</span>
              <span className="mb-1 text-sm text-muted-foreground">/ 100</span>
            </div>
            <p className={`mt-1 text-sm font-medium ${gradeTone(ev.grade)}`}>{ev.grade ?? "ยังไม่ได้ให้คะแนน / Not scored"}</p>
            <p className="mt-2 text-xs text-muted-foreground">น้ำหนักช่วง / Stage weight: 30 วัน {template.stageWeights.d30}% · 60 วัน {template.stageWeights.d60}% · 90 วัน {template.stageWeights.d90}%</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">เกณฑ์ผลประเมิน / Grade bands</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-xs">
            {template.grades.map((g) => (
              <span key={g.label} className={`rounded-md border px-2 py-1 ${gradeTone(g.label)}`}>
                {g.min}+ · {g.label} <span className="text-muted-foreground">({g.labelTh})</span>
              </span>
            ))}
            <p className="mt-1 w-full text-muted-foreground">{SCALE_LEGEND}</p>
          </CardContent>
        </Card>
      </div>

      {/* Stage summary */}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {template.stages.map((s) => (
          <Card key={s.key}>
            <CardHeader className="pb-1"><CardTitle className="text-xs">{s.label}</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <p>{s.goal}</p>
              <p className="text-foreground"><span className="font-medium">ผลลัพธ์:</span> {s.outcome}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Numeric KPI reference */}
      <Card className="mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">KPI เป้าหมายเชิงตัวเลข / Numeric KPI targets (90 วัน)</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
            {template.numericKpis.map((n) => (
              <div key={n.label} className="flex justify-between gap-2 border-b border-dashed py-1">
                <span className="text-muted-foreground">{n.label}</span>
                <span className="font-medium tabular-nums whitespace-nowrap">{n.target}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <form action={save} className="space-y-4">
        {/* Meta */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ข้อมูลการประเมิน / Review info</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="reviewerName">ผู้ประเมิน / Reviewer</Label>
              <Input id="reviewerName" name="reviewerName" defaultValue={ev.reviewerName ?? user.name} disabled={readOnly} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="currentStage">รอบที่ประเมิน / Checkpoint</Label>
              <Select id="currentStage" name="currentStage" defaultValue={ev.currentStage ?? "d30"} disabled={readOnly}>
                {STAGE_KEYS.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">สถานะ / Status</Label>
              <Select id="status" name="status" defaultValue={ev.status} disabled={readOnly}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reviewPeriodStart">วันเริ่มงาน / Start</Label>
              <Input id="reviewPeriodStart" name="reviewPeriodStart" type="date" defaultValue={dateInputValue(ev.reviewPeriodStart)} disabled={readOnly} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="probationEndDate">ครบทดลองงาน / Probation end</Label>
              <Input id="probationEndDate" name="probationEndDate" type="date" defaultValue={dateInputValue(ev.probationEndDate)} disabled={readOnly} />
            </div>
          </CardContent>
        </Card>

        {/* KPI rows */}
        {template.kpis.map((kpi, idx) => {
          const pct = percentByKpi.get(kpi.key);
          return (
            <Card key={kpi.key}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm">
                    <span className="text-muted-foreground">{idx + 1}.</span> {kpi.labelTh} <span className="text-muted-foreground">/ {kpi.label}</span>
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">น้ำหนัก {kpi.weight}%</span>
                    {pct != null && <span className="rounded-full border px-2 py-0.5 tabular-nums">{Math.round(pct)}%</span>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">🎯 เป้าหมาย / Target: {kpi.target}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  {STAGE_KEYS.map((stage) => (
                    <div key={stage} className="rounded-md border p-2.5">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold">{STAGE_LABEL[stage]}</span>
                        <Select name={`score_${kpi.key}_${stage}`} defaultValue={scoreOf(kpi.key, stage)} disabled={readOnly} className="h-7 w-16 text-xs">
                          <option value="">—</option>
                          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                        </Select>
                      </div>
                      <p className="text-xs text-muted-foreground">{kpi[stage]}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <Input name={`note_${kpi.key}`} defaultValue={scores[kpi.key]?.note ?? ""} disabled={readOnly} placeholder={`หลักฐาน/หมายเหตุ / Evidence · ${kpi.evidence}`} className="text-xs" />
                </div>
              </CardContent>
            </Card>
          );
        })}

        {/* Manager assessment + comments */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">การประเมินโดยผู้จัดการ / Manager Assessment (90 วัน)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              {template.managerChecklist.map((c) => (
                <li key={c} className="flex items-start gap-1.5"><span className="mt-0.5 text-primary">•</span><span>{c}</span></li>
              ))}
            </ul>
            <div className="space-y-1.5">
              <Label htmlFor="managerComment">ความเห็นผู้จัดการ / Manager comment</Label>
              <Textarea id="managerComment" name="managerComment" defaultValue={ev.managerComment ?? ""} disabled={readOnly} rows={3} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">ความเห็นพนักงาน / Employee comment</CardTitle></CardHeader>
            <CardContent>
              <Textarea name="employeeComment" defaultValue={ev.employeeComment ?? ""} disabled={readOnly} rows={4} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">แผนพัฒนา / Action plan</CardTitle></CardHeader>
            <CardContent>
              <Textarea name="actionPlan" defaultValue={ev.actionPlan ?? ""} disabled={readOnly} rows={4} />
            </CardContent>
          </Card>
        </div>

        {canManage && (
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">อัปเดตล่าสุด / Updated {formatDate(ev.updatedAt)}</div>
            <div className="flex gap-2">
              <Button type="submit">บันทึก / Save</Button>
            </div>
          </div>
        )}
      </form>

      {canManage && (
        <form action={del} className="mt-6 border-t pt-4">
          <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /> ลบแบบประเมิน / Delete</Button>
        </form>
      )}

      <p className="mt-4 text-xs text-muted-foreground">เอกสารประเมินผลการทดลองงานเท่านั้น — ไม่ได้ให้สิทธิ์การใช้งานระบบใด ๆ / Probation review document only; grants no system access.</p>
    </div>
  );
}
