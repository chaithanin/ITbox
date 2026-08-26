import Link from "next/link";
import {
  Activity, AlertTriangle, ShieldCheck, ClipboardCheck, ListChecks,
  Server, Database, HardDrive, Cctv, Smartphone, Navigation, ScrollText, LogIn, MonitorCog, CheckCircle2, Circle, ChevronRight, Upload, FileText, Download,
} from "lucide-react";
import type { CaseStatus } from "@prisma/client";
import { requirePermission, getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CATEGORY_META, CATEGORY_ORDER, HEALTH_META, MODE_META, CHECKLIST,
  rollupByCategory, computeKpis, exceptions, healthColor,
  storageStatus, estimateFullDate,
  type HealthCheck, type ItSystemCategory,
} from "@/lib/services/it-report";
import { Sparkline } from "../dashboard/it-dashboard/charts";
import { RecordCheckForm } from "./record-form";
import { EvidenceControl } from "./evidence-control";
import { verifyCheckAction } from "./actions";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["NEW", "TRIAGE", "ASSIGNED", "IN_PROGRESS", "WAITING_USER", "WAITING_VENDOR", "REOPENED"] as const;

const CAT_ICON: Record<ItSystemCategory, React.ComponentType<{ className?: string }>> = {
  SERVER: Server, BACKUP: Database, STORAGE: HardDrive, CCTV: Cctv, PHONE: Smartphone,
  GPS: Navigation, LOG: ScrollText, MANGO_LOGIN: LogIn, MANGO_USAGE: MonitorCog, OTHER: Activity,
};

const MSG: Record<string, { text: string; error?: boolean }> = {
  recorded: { text: "บันทึกผลการตรวจแล้ว / Check recorded" },
  verified: { text: "ยืนยันผลแล้ว / Verified" },
  invalid: { text: "ข้อมูลไม่ถูกต้อง / Invalid input", error: true },
  notfound: { text: "ไม่พบรายการ / Not found", error: true },
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export default async function ItReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const viewer = await requirePermission("report:read");
  const user = await getCurrentUser();
  const canRecord = !!user?.permissions.has("support:work");
  const sp = await searchParams;
  const msg = MSG[sp.ok ?? sp.error ?? ""];
  const orgId = viewer.organizationId;

  // Latest report date that has data, else today.
  const latest = await prisma.itHealthCheck.findFirst({
    where: { organizationId: orgId, deletedAt: null },
    orderBy: { checkDate: "desc" },
    select: { checkDate: true },
  });
  const reportDate = latest?.checkDate ?? new Date();

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [rawChecks, openIssues, openCount, overdueCount, locations, history] = await Promise.all([
    prisma.itHealthCheck.findMany({
      where: { organizationId: orgId, deletedAt: null, checkDate: reportDate },
      include: {
        location: { select: { name: true } },
        evidence: {
          select: { id: true, name: true, contentType: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.supportCase.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { in: OPEN_STATUSES as unknown as CaseStatus[] } },
      select: { id: true, caseNumber: true, subject: true, priority: true, status: true, createdAt: true, resolutionDueAt: true, assignedUser: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.supportCase.count({ where: { organizationId: orgId, deletedAt: null, status: { in: OPEN_STATUSES as unknown as CaseStatus[] } } }),
    prisma.supportCase.count({ where: { organizationId: orgId, deletedAt: null, status: { in: OPEN_STATUSES as unknown as CaseStatus[] }, resolutionDueAt: { lt: new Date() } } }),
    prisma.location.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.itHealthCheck.findMany({
      where: { organizationId: orgId, deletedAt: null, checkDate: { gte: since } },
      select: { checkDate: true, category: true, name: true, status: true, healthPercent: true, metrics: true },
    }),
  ]);

  // ---- Overall-health trend across recent report dates ----
  const byDate = new Map<string, { normal: number; checked: number }>();
  for (const h of history) {
    const k = h.checkDate.toISOString().slice(0, 10);
    let e = byDate.get(k);
    if (!e) { e = { normal: 0, checked: 0 }; byDate.set(k, e); }
    if (h.status !== "NOT_CHECKED") e.checked++;
    if (h.status === "NORMAL") e.normal++;
  }
  const trendDates = [...byDate.keys()].sort().slice(-10);
  const trendPoints = trendDates.map((k) => {
    const e = byDate.get(k)!;
    return e.checked > 0 ? Math.round((e.normal / e.checked) * 100) : 0;
  });

  // ---- Storage forecast: per storage item, series of used% over time ----
  const usedOf = (m: unknown, hp: number | null): number | null => {
    const mm = (m ?? {}) as Record<string, unknown>;
    const raw = mm.usedPercent ?? mm.storage ?? mm.used;
    const n = typeof raw === "string" ? Number(raw.replace("%", "")) : typeof raw === "number" ? raw : hp;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  };
  const storageSeries = new Map<string, { date: Date; used: number }[]>();
  for (const h of history) {
    if (h.category !== "STORAGE") continue;
    const used = usedOf(h.metrics, h.healthPercent);
    if (used == null) continue;
    const arr = storageSeries.get(h.name) ?? [];
    arr.push({ date: h.checkDate, used });
    storageSeries.set(h.name, arr);
  }
  const storageForecast = [...storageSeries.entries()].map(([name, series]) => {
    const latest = [...series].sort((a, b) => b.date.getTime() - a.date.getTime())[0];
    return { name, used: latest.used, status: storageStatus(latest.used), fullDate: estimateFullDate(series) };
  }).sort((a, b) => b.used - a.used);

  const checks: HealthCheck[] = rawChecks.map((c) => ({
    id: c.id, category: c.category as ItSystemCategory, name: c.name, mode: c.mode, status: c.status,
    healthPercent: c.healthPercent, metrics: c.metrics, note: c.note, issueCaseId: c.issueCaseId,
    locationName: c.location?.name ?? null,
  }));

  const kpis = computeKpis(checks);
  const rollups = rollupByCategory(checks);
  const rollupByCat = new Map(rollups.map((r) => [r.category, r]));
  const attention = exceptions(checks);
  const hColor = healthColor(kpis.healthPercent);

  return (
    <div className="space-y-5">
      <PageHeader
        title="IT Support Report / รายงานสุขภาพระบบ IT ประจำวัน"
        description={`Daily IT Health — ${fmtDate(reportDate)} · Monitor → Detect → Check → Issue → Resolve → Verify`}
      >
        {canRecord && (
          <Button variant="outline" asChild>
            <Link href="/it-report/import"><Upload className="h-4 w-4" /> นำเข้าผลตรวจ / Import</Link>
          </Button>
        )}
        <Button variant="outline" asChild>
          <a href={`/api/it-report/export?format=pdf&date=${reportDate.toISOString().slice(0, 10)}`}><FileText className="h-4 w-4" /> PDF</a>
        </Button>
        <Button asChild>
          <a href={`/api/it-report/export?format=xlsx&date=${reportDate.toISOString().slice(0, 10)}`}><Download className="h-4 w-4" /> Generate Report</a>
        </Button>
      </PageHeader>

      {msg && (
        <p className={`rounded-md px-3 py-2 text-sm ${msg.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {msg.text}
        </p>
      )}

      {/* Overall + KPIs */}
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <p className="text-xs font-medium text-muted-foreground">IT Infrastructure Health</p>
            <p className="mt-2 text-5xl font-bold" style={{ color: hColor }}>{kpis.healthPercent}%</p>
            <div className="mt-3 h-2.5 w-full max-w-[180px] overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${kpis.healthPercent}%`, backgroundColor: hColor }} />
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">ตรวจแล้ว {kpis.checked}/{kpis.total} รายการ</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardContent className="grid grid-cols-3 gap-3 p-5 sm:grid-cols-6">
            {[
              { label: "Systems", value: kpis.total, tone: "text-foreground" },
              { label: "🟢 Normal", value: kpis.normal, tone: "text-emerald-600" },
              { label: "🟡 Warning", value: kpis.warning, tone: "text-amber-600" },
              { label: "🔴 Critical", value: kpis.critical, tone: "text-red-600" },
              { label: "⚪ Pending", value: kpis.notChecked, tone: "text-slate-500" },
              { label: "Open Issues", value: openCount, tone: "text-rose-600", href: "/support/queue" },
            ].map((k) => {
              const body = <><p className={`text-2xl font-bold ${k.tone}`}>{k.value}</p><p className="mt-1 text-[11px] text-muted-foreground">{k.label}</p></>;
              return k.href ? (
                <Link key={k.label} href={k.href} className="rounded-md p-2 text-center transition-colors hover:bg-accent">{body}</Link>
              ) : (
                <div key={k.label} className="p-2 text-center">{body}</div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* TREND + STORAGE FORECAST */}
      {(trendPoints.length > 1 || storageForecast.length > 0) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {trendPoints.length > 1 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Activity className="h-4 w-4 text-blue-600" /> แนวโน้มสุขภาพ / Health Trend ({trendDates.length} วัน)</CardTitle></CardHeader>
              <CardContent>
                <Sparkline points={trendPoints} color={hColor} height={70} />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>{trendDates[0]?.slice(5)}</span><span>{trendDates[trendDates.length - 1]?.slice(5)}</span>
                </div>
              </CardContent>
            </Card>
          )}
          {storageForecast.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><HardDrive className="h-4 w-4 text-sky-600" /> พื้นที่จัดเก็บ / Storage Forecast</CardTitle></CardHeader>
              <CardContent className="space-y-2.5">
                {storageForecast.map((s) => {
                  const h = HEALTH_META[s.status];
                  return (
                    <div key={s.name} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{s.name}</span>
                        <span className={h.text}>{s.used}%{s.fullDate ? ` · เต็ม ~${s.fullDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : ""}</span>
                      </div>
                      <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${h.bg}`} style={{ width: `${Math.min(100, s.used)}%` }} />
                      </div>
                    </div>
                  );
                })}
                <p className="text-[10px] text-muted-foreground">Threshold: &lt;70% 🟢 · 70–85% 🟡 · &gt;85% 🔴 · วันที่เต็มประเมินจากแนวโน้ม used% ย้อนหลัง</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* NEED ATTENTION */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-red-600" /> ต้องดำเนินการ / Need Attention</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {attention.length === 0 && (
              <p className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-4 w-4" /> ไม่มีรายการผิดปกติ / Nothing abnormal today
              </p>
            )}
            {attention.map((c) => {
              const h = HEALTH_META[c.status];
              const Icon = CAT_ICON[c.category];
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-md border p-3">
                  <Icon className={`h-4 w-4 shrink-0 ${h.text}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {CATEGORY_META[c.category].en}{c.locationName ? ` · ${c.locationName}` : ""}{c.note ? ` · ${c.note}` : ""}
                    </span>
                  </span>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${h.bg}`} />
                  {canRecord && (
                    c.issueCaseId ? (
                      <Badge variant="secondary">มี Issue</Badge>
                    ) : (
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/support/new?subject=${encodeURIComponent(`[${CATEGORY_META[c.category].en}] ${c.name}${c.note ? " — " + c.note : ""}`)}`}>Create Issue</Link>
                      </Button>
                    )
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* SYSTEM HEALTH */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Activity className="h-4 w-4 text-blue-600" /> สุขภาพระบบ / System Health</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {CATEGORY_ORDER.map((cat) => {
              const r = rollupByCat.get(cat);
              const Icon = CAT_ICON[cat];
              const worst = r?.worst ?? "NOT_CHECKED";
              const h = HEALTH_META[worst];
              return (
                <div key={cat} className="flex items-center gap-3 rounded-md border p-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-sm">{CATEGORY_META[cat].label} <span className="text-muted-foreground">/ {CATEGORY_META[cat].en}</span></span>
                  {r ? (
                    <span className="text-xs text-muted-foreground">
                      {r.normal}/{r.total} ปกติ{r.warning ? ` · ${r.warning}⚠` : ""}{r.critical ? ` · ${r.critical}🔴` : ""}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">ยังไม่ตรวจ</span>
                  )}
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${h.bg}`} title={h.label} />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* OPEN ISSUES + CHECKLIST */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-orange-600" /> Open IT Issues</CardTitle>
            <span className="text-xs text-muted-foreground">{openCount} เปิดอยู่{overdueCount > 0 ? ` · ${overdueCount} เกิน SLA` : ""}</span>
          </CardHeader>
          <CardContent className="space-y-2">
            {openIssues.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีเคสที่เปิดอยู่ / No open cases</p>}
            {openIssues.map((c) => (
              <Link key={c.id} href={`/support/${c.id}`} className="flex items-center gap-3 rounded-md border p-2.5 hover:bg-accent">
                <Badge variant={c.priority === "P1" ? "destructive" : "secondary"}>{c.priority}</Badge>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.subject}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.caseNumber} · {c.status}{c.assignedUser ? ` · ${c.assignedUser.name}` : " · ยังไม่มอบหมาย"}</span>
                </span>
                {c.resolutionDueAt && c.resolutionDueAt < new Date() && <Badge variant="destructive">Over SLA</Badge>}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ListChecks className="h-4 w-4 text-violet-600" /> Daily IT Checklist</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {CHECKLIST.map((item) => {
              const r = rollupByCat.get(item.key);
              const auto = checks.some((c) => c.category === item.key && c.mode === "AUTO");
              const done = !!r && r.notChecked === 0;
              return (
                <div key={item.key} className="flex items-center gap-2.5 text-sm">
                  {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  <span className={`flex-1 ${done ? "" : "text-muted-foreground"}`}>{item.label}</span>
                  {auto && <span className="text-[10px] font-medium text-emerald-600">✓ Auto</span>}
                  {!r && <span className="text-[10px] text-muted-foreground">รอตรวจ</span>}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* RECORD + FULL LIST */}
      {canRecord && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ClipboardCheck className="h-4 w-4 text-primary" /> บันทึกผลการตรวจ / Record a check</CardTitle></CardHeader>
          <CardContent><RecordCheckForm /></CardContent>
        </Card>
      )}

      {checks.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">รายการตรวจทั้งหมด / All checks ({checks.length})</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {rawChecks.map((c) => {
              const h = HEALTH_META[c.status];
              const Icon = CAT_ICON[c.category as ItSystemCategory];
              const verify = verifyCheckAction.bind(null, c.id);
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-2.5 rounded-md border p-2.5 text-sm">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{CATEGORY_META[c.category as ItSystemCategory].en}</span>
                  <span className="min-w-[140px] flex-1 font-medium">
                    {c.name}
                    {(() => {
                      const m = (c.metrics ?? {}) as Record<string, unknown>;
                      const on = typeof m.online === "string" ? m.online : null;
                      const rec = typeof m.recording === "string" ? m.recording : null;
                      if (!on && !rec) return null;
                      const tone = (v: string) => /off|missing|cannot|fail/i.test(v) ? "text-red-600" : /verify|warn/i.test(v) ? "text-amber-600" : "text-emerald-600";
                      return (
                        <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                          {on && <span className={tone(on)}>● {on}</span>}
                          {on && rec && " · "}
                          {rec && <span className={tone(rec)}>REC {rec}</span>}
                        </span>
                      );
                    })()}
                  </span>
                  <span className={`text-[11px] ${MODE_META[c.mode].text}`}>{MODE_META[c.mode].label}</span>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${h.badge}`}>
                    <span className={`h-2 w-2 rounded-full ${h.bg}`} /> {h.label}
                  </span>
                  {c.healthPercent != null && <span className="text-xs text-muted-foreground">{c.healthPercent}%</span>}
                  {c.verifiedAt ? (
                    <span className="text-[11px] text-emerald-600">✓ ยืนยันแล้ว</span>
                  ) : canRecord ? (
                    <form action={verify}><Button size="sm" variant="ghost" className="h-7 text-xs">ยืนยัน / Verify</Button></form>
                  ) : null}
                  {(canRecord || c.evidence.length > 0) && (
                    <div className="basis-full pl-6">
                      <EvidenceControl checkId={c.id} items={c.evidence} canEdit={canRecord} />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
