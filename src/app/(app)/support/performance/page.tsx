import Link from "next/link";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  computeScorecard, computeMonthlyHistory, analyzeScorecard,
  KPI_META, statusDot, statusColorClass, type KpiPeriodKey,
} from "@/lib/services/kpi";

export const dynamic = "force-dynamic";

const PERIODS: { key: KpiPeriodKey; label: string }[] = [
  { key: "month", label: "เดือนนี้ / This month" },
  { key: "quarter", label: "ไตรมาสนี้ / This quarter" },
  { key: "year", label: "ปีนี้ / This year" },
];

function fmt(metric: string, v: number): string {
  const unit = KPI_META[metric as keyof typeof KPI_META]?.unit ?? "";
  return unit === "%" ? `${v}%` : unit === "/5" ? `${v}/5` : `${v}${unit ? " " + unit : ""}`;
}

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("support:work") && !user.permissions.has("support:read")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        หน้านี้สำหรับเจ้าหน้าที่ IT Support / For IT support agents only.
      </div>
    );
  }
  const sp = await searchParams;
  const period = (["month", "quarter", "year"].includes(sp.period ?? "") ? sp.period : "month") as KpiPeriodKey;
  const now = new Date();

  const [card, history] = await Promise.all([
    computeScorecard(user.organizationId, user.id, period, now),
    computeMonthlyHistory(user.organizationId, user.id, now),
  ]);
  const analysis = analyzeScorecard(card, now);

  const ring =
    card.overallStatus === "green" ? "ring-emerald-500" :
    card.overallStatus === "yellow" ? "ring-amber-500" : "ring-red-500";
  const overallLabel =
    card.overall >= 85 ? "🟢 Excellent" : card.overall >= 70 ? "🟡 Need Improvement" : "🔴 At Risk";

  return (
    <div>
      <PageHeader
        title="ผลงานของฉัน / My Performance"
        description="สรุป KPI งาน IT Support ของคุณ — คำนวณจากเคสจริงในระบบ"
      />

      {/* Period tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/support/performance?period=${p.key}`}
            className={`rounded-full border px-3.5 py-1.5 text-sm ${p.key === period ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-accent"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Overall score */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-sm">คะแนนรวม / Overall KPI</CardTitle></CardHeader>
          <CardContent className="flex flex-col items-center py-4">
            <div className={`flex h-32 w-32 items-center justify-center rounded-full ring-8 ${ring}`}>
              <div className="text-center">
                <div className="text-4xl font-bold tabular-nums">{card.overall}</div>
                <div className="text-xs text-muted-foreground">/ 100</div>
              </div>
            </div>
            <p className="mt-3 font-medium">{overallLabel}</p>
            <div className="mt-3 flex gap-4 text-center text-sm">
              <div><div className="font-bold tabular-nums">{card.openTickets}</div><div className="text-xs text-muted-foreground">งานค้าง</div></div>
              <div><div className={`font-bold tabular-nums ${card.overdueTickets > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{card.overdueTickets}</div><div className="text-xs text-muted-foreground">เกินกำหนด</div></div>
            </div>
          </CardContent>
        </Card>

        {/* KPI cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          {card.metrics.map((m) => {
            const meta = KPI_META[m.metric];
            return (
              <div key={m.metric} className="rounded-xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{meta.icon} {meta.labelTh}</span>
                  <span>{statusDot(m.status)}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className={`text-2xl font-bold tabular-nums ${statusColorClass(m.status)}`}>{fmt(m.metric, m.actual)}</span>
                  <span className="text-xs text-muted-foreground">/ เป้า {fmt(m.metric, m.target)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">น้ำหนัก {m.weight}% · คะแนน {m.score}/100</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Gap Analysis */}
      <Card className="mt-4">
        <CardHeader className="pb-3"><CardTitle className="text-sm">⚠️ KPI Gap Analysis — ยังขาดอะไรบ้าง</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>KPI</TableHead>
                <TableHead>เป้าหมาย</TableHead>
                <TableHead>ปัจจุบัน</TableHead>
                <TableHead>ขาด</TableHead>
                <TableHead>ต้องทำ/วัน</TableHead>
                <TableHead>สถานะ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {card.metrics.map((m) => (
                <TableRow key={m.metric}>
                  <TableCell className="font-medium">{KPI_META[m.metric].labelTh}</TableCell>
                  <TableCell>{fmt(m.metric, m.target)}</TableCell>
                  <TableCell>{fmt(m.metric, m.actual)}</TableCell>
                  <TableCell>{m.status === "green" ? "ผ่าน" : fmt(m.metric, m.gap)}</TableCell>
                  <TableCell>{m.requiredPerDay ? `${m.requiredPerDay}/วัน` : "-"}</TableCell>
                  <TableCell><span className={statusColorClass(m.status)}>{statusDot(m.status)}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Analysis */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">✨ วิเคราะห์ผลงาน / Analysis</CardTitle></CardHeader>
          <CardContent>
            <p className="mb-3 text-sm">{analysis.headline}</p>
            {analysis.actions.length === 0 ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">ไม่มีสิ่งที่ต้องปรับปรุง 🎉</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {analysis.actions.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <span>{statusDot(a.level)}</span>
                    <span>{a.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* YTD monthly history */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">📅 KPI รายเดือน ปีนี้ — เฉลี่ย {history.annual}/100</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {history.months.map((mo) => (
                <div key={mo.month} className="flex items-center gap-2 text-sm">
                  <span className="w-10 text-xs text-muted-foreground">{mo.labelTh}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
                    {mo.overall !== null && (
                      <div
                        className={`h-full ${mo.status === "green" ? "bg-emerald-500" : mo.status === "yellow" ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${mo.overall}%` }}
                      />
                    )}
                  </div>
                  <span className="w-14 text-right text-xs tabular-nums">{mo.overall === null ? "-" : `${mo.overall}${mo.status ? " " + statusDot(mo.status) : ""}`}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex gap-2">
        <Link href="/support/queue" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          ไปจัดการ Ticket / Manage Tickets
        </Link>
      </div>
    </div>
  );
}
