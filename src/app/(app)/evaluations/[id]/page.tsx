import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, FileSignature, Trash2 } from "lucide-react";
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
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import {
  getEvalTemplate,
  computeEvaluation,
  categoryScore,
  STAGE_KEYS,
  STAGE_LABEL,
  SCALE_LEGEND,
  type StageKey,
  type EvalScores,
} from "@/lib/documents/evaluation-templates";
import { saveEvaluation, deleteEvaluation } from "../actions";

const STATUSES = ["DRAFT", "IN_REVIEW", "COMPLETED"] as const;

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
  const readOnly = !canManage;

  const ev = await prisma.evaluation.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!ev) notFound();
  const template = getEvalTemplate(ev.template);
  if (!template) notFound();

  const scores = (ev.scores ?? {}) as EvalScores;
  const computed = computeEvaluation(template, scores);
  const save = saveEvaluation.bind(null, ev.id);
  const del = deleteEvaluation.bind(null, ev.id);

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
        <Button variant="outline" asChild><a href={`/api/evaluations/${ev.id}/pdf?doc=notice`} target="_blank" rel="noopener"><FileSignature className="h-4 w-4" /> หนังสือแจ้งเป้าหมาย</a></Button>
        <Button variant="outline" asChild><a href={`/api/evaluations/${ev.id}/pdf`} target="_blank" rel="noopener"><FileText className="h-4 w-4" /> แบบประเมิน / PDF</a></Button>
        <StatusBadge status={ev.status} />
      </PageHeader>

      {sp.ok === "created" && <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">สร้างแบบประเมินแล้ว / Assessment created</div>}
      {sp.ok === "saved" && <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">บันทึกเรียบร้อย / Saved</div>}

      {/* Per-round totals */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {STAGE_KEYS.map((s) => {
          const r = computed.rounds[s];
          const isFinal = computed.finalStage === s;
          return (
            <Card key={s} className={isFinal ? "border-primary/50" : ""}>
              <CardHeader className="pb-1"><CardTitle className="text-xs">คะแนนรอบ {STAGE_LABEL[s]}{isFinal ? " · ใช้ตัดสินผล" : ""}</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-end gap-1">
                  <span className="text-3xl font-bold tabular-nums">{r.total != null ? Math.round(r.total) : "—"}</span>
                  <span className="mb-1 text-xs text-muted-foreground">/ 100</span>
                </div>
                <p className={`text-xs font-medium ${gradeTone(r.grade?.label)}`}>{r.grade?.label ?? "ยังไม่ประเมิน"}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">เกณฑ์ผลประเมิน / Grade bands</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-xs">
          {template.grades.map((g) => (
            <span key={g.label} className={`rounded-md border px-2 py-1 ${gradeTone(g.label)}`}>{g.min}+ · {g.label} <span className="text-muted-foreground">({g.labelTh})</span></span>
          ))}
          <p className="mt-1 w-full text-muted-foreground">ผ่านเกณฑ์ทดลองงานที่ ≥ {template.passMark} · {SCALE_LEGEND}</p>
        </CardContent>
      </Card>

      {/* Stage reference */}
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        {template.stages.map((s) => (
          <Card key={s.key}>
            <CardHeader className="pb-1"><CardTitle className="text-xs">{s.label}</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <p className="italic">“{s.question}”</p>
              <ul className="space-y-0.5">
                {s.checklist.map((c) => <li key={c} className="flex gap-1"><span className="text-primary">•</span>{c}</li>)}
              </ul>
              <p className="text-foreground"><span className="font-medium">ผลลัพธ์:</span> {s.outcome}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Numeric KPI reference */}
      <Card className="mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">ตัวชี้วัดเชิงตัวเลข / Numeric KPI targets (ณ วันที่ 90)</CardTitle></CardHeader>
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

        {/* KPI scoring — 12 rows, 1–5 per round */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">คะแนน KPI (ให้คะแนน 1–5 เทียบกับเป้าหมายของแต่ละรอบ)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {template.kpis.map((kpi) => {
              const cat = template.categories.find((c) => c.key === kpi.category);
              return (
                <div key={kpi.key} className="rounded-md border p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="text-sm font-medium">{kpi.no}. {kpi.labelTh} <span className="text-muted-foreground">/ {kpi.label}</span></span>
                    <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{cat?.label} · {cat?.weight}%</span>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    {STAGE_KEYS.map((stage) => (
                      <div key={stage} className="rounded border bg-muted/30 p-2">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-semibold">{STAGE_LABEL[stage]}</span>
                          <Select name={`score_${kpi.key}_${stage}`} defaultValue={scoreOf(kpi.key, stage)} disabled={readOnly} className="h-7 w-14 text-xs">
                            <option value="">—</option>
                            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                          </Select>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{kpi[stage]}</p>
                      </div>
                    ))}
                  </div>
                  <Input name={`note_${kpi.key}`} defaultValue={scores[kpi.key]?.note ?? ""} disabled={readOnly} placeholder="หลักฐาน / ความเห็น (Evidence / note)" className="mt-2 h-8 text-xs" />
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Category summary (computed) */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">สรุปคะแนนตามหมวด / Category summary</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>หมวด / Category</TableHead><TableHead className="text-right">น้ำหนัก</TableHead>
                {STAGE_KEYS.map((s) => <TableHead key={s} className="text-right">{STAGE_LABEL[s]}</TableHead>)}
              </TableRow></TableHeader>
              <TableBody>
                {template.categories.map((c) => (
                  <TableRow key={c.key}>
                    <TableCell className="text-xs">{c.labelTh} <span className="text-muted-foreground">/ {c.label}</span></TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{c.weight}%</TableCell>
                    {STAGE_KEYS.map((s) => {
                      const avg = computed.categoryAvg[c.key]?.[s];
                      const cs = categoryScore(template, c, avg);
                      return <TableCell key={s} className="text-right text-xs tabular-nums">{cs != null ? `${cs.toFixed(1)}` : "—"}<span className="text-muted-foreground">{avg != null ? ` (${avg.toFixed(1)})` : ""}</span></TableCell>;
                    })}
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell className="text-xs">คะแนนรวม / Total</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">100%</TableCell>
                  {STAGE_KEYS.map((s) => <TableCell key={s} className="text-right text-xs tabular-nums">{computed.rounds[s].total != null ? Math.round(computed.rounds[s].total!) : "—"}</TableCell>)}
                </TableRow>
              </TableBody>
            </Table>
            <p className="mt-1 text-[11px] text-muted-foreground">คะแนนหมวด = (คะแนนเฉลี่ยของ KPI ในหมวด ÷ 5) × น้ำหนัก · ตัวเลขในวงเล็บคือค่าเฉลี่ย 1–5</p>
          </CardContent>
        </Card>

        {/* Improvement (90-day) */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">งานปรับปรุง (Improvement) ที่พนักงานเสนอเอง — รอบ 90 วัน</CardTitle></CardHeader>
          <CardContent>
            <Textarea name="improvementNote" defaultValue={ev.improvementNote ?? ""} disabled={readOnly} rows={3} placeholder="เรื่อง / ปัญหา–สาเหตุ / สิ่งที่แก้ไข / ผลก่อน→หลัง (เช่น Printer ชั้น 2 เสีย 8 ครั้ง/เดือน → เปลี่ยน Config → เหลือ 1 ครั้ง/เดือน)" />
          </CardContent>
        </Card>

        {/* Manager assessment + comments */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">การประเมินโดยผู้บังคับบัญชา / Manager Assessment (90 วัน)</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ul className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
              {template.managerChecklist.map((c) => <li key={c} className="flex items-start gap-1.5"><span className="mt-0.5 text-primary">•</span><span>{c}</span></li>)}
            </ul>
            <div className="space-y-1.5">
              <Label htmlFor="managerComment">ความเห็นผู้ประเมิน / จุดแข็ง–สิ่งที่ต้องพัฒนา</Label>
              <Textarea id="managerComment" name="managerComment" defaultValue={ev.managerComment ?? ""} disabled={readOnly} rows={3} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">แผนพัฒนา / Action plan (รอบถัดไป)</CardTitle></CardHeader>
            <CardContent><Textarea name="actionPlan" defaultValue={ev.actionPlan ?? ""} disabled={readOnly} rows={4} /></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">ความเห็นพนักงาน / Employee comment</CardTitle></CardHeader>
            <CardContent><Textarea name="employeeComment" defaultValue={ev.employeeComment ?? ""} disabled={readOnly} rows={4} /></CardContent>
          </Card>
        </div>

        {/* Probation decision (90-day) */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ผลการพิจารณาทดลองงาน / Probation decision (รอบ 90 วัน)</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="probationResult">ผล / Result</Label>
              <Select id="probationResult" name="probationResult" defaultValue={ev.probationResult ?? ""} disabled={readOnly}>
                <option value="">— ยังไม่สรุป —</option>
                <option value="PASS">ผ่านการทดลองงาน / Pass</option>
                <option value="FAIL">ไม่ผ่านการทดลองงาน / Fail</option>
                <option value="OTHER">อื่น ๆ / Other</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="probationEffectiveFrom">มีผลตั้งแต่ / Effective from</Label>
              <Input id="probationEffectiveFrom" name="probationEffectiveFrom" type="date" defaultValue={dateInputValue(ev.probationEffectiveFrom)} disabled={readOnly} />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="decisionNote">เหตุผลประกอบ / Note</Label>
              <Input id="decisionNote" name="decisionNote" defaultValue={ev.decisionNote ?? ""} disabled={readOnly} />
            </div>
          </CardContent>
        </Card>

        {canManage && (
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground">อัปเดตล่าสุด / Updated {formatDate(ev.updatedAt)}</div>
            <Button type="submit">บันทึก / Save</Button>
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
