import Link from "next/link";
import { ArrowLeft, Download, AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { ReportHeader, ExecutiveSummary, ChartCard } from "@/components/report/ui";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatMoney, formatDate } from "@/lib/utils";
import { getSubscriptions } from "@/lib/services/reports";
import { Pagination, parsePage } from "@/components/list-controls";

export const dynamic = "force-dynamic";

function RenewalBadge({ days, status }: { days: number | null; status: string }) {
  if (status !== "ACTIVE") return <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{status}</span>;
  if (days == null) return <span className="text-xs text-muted-foreground">-</span>;
  if (days < 0) return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><ShieldAlert className="h-3 w-3" /> เกินกำหนด</span>;
  if (days <= 7) return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><ShieldAlert className="h-3 w-3" /> Critical</span>;
  if (days <= 30) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3 w-3" /> Warning</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> OK</span>;
}

export default async function SubscriptionReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;
  const s = await getSubscriptions(user.organizationId);
  const { page, skip, take } = parsePage(sp.page);
  const pageRows = s.rows.slice(skip, skip + take);
  const pageCount = Math.max(1, Math.ceil(s.rows.length / take));

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/reports"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="แดชบอร์ด Subscription / Subscription & Renewal Dashboard" description="บริการรายเดือน/รายปี ค่าใช้จ่าย และการต่ออายุ">
        <Button variant="outline" asChild><a href="/api/reports/subscriptions?format=xlsx"><Download className="h-4 w-4" /> Excel</a></Button>
      </PageHeader>
      <ReportHeader reportName="IT Subscription & Renewal Report" generatedBy={user.name} />
      <ExecutiveSummary>
        มีบริการทั้งหมด <b>{s.total}</b> — ใช้งานอยู่ {s.active}, ใกล้ต่ออายุใน 30 วัน <b className={s.expiringSoon > 0 ? "text-amber-600 dark:text-amber-400" : ""}>{s.expiringSoon}</b>.
        ค่าใช้จ่ายรวมต่อปี <b>฿{formatMoney(s.annualCost)}</b> (เฉลี่ยเดือนละ ฿{formatMoney(s.monthlyEquivalent)}).
      </ExecutiveSummary>
      <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-5">
        <StatCard label="ทั้งหมด / Total" value={s.total} href="/subscriptions" />
        <StatCard label="ใช้งาน / Active" value={s.active} tone="success" href="/subscriptions" />
        <StatCard label="ใกล้ต่ออายุ / Expiring ≤30d" value={s.expiringSoon} tone={s.expiringSoon > 0 ? "warning" : "default"} href="/subscriptions" />
        <StatCard label="ต่อปี / Annual Cost" value={`฿${formatMoney(s.annualCost)}`} href="/subscriptions" />
        <StatCard label="ต่อเดือน / Monthly" value={`฿${formatMoney(s.monthlyEquivalent)}`} href="/subscriptions" />
      </div>
      <ChartCard title={`รายการ / Detail (${s.rows.length})`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>บริการ / Service</TableHead><TableHead>แพ็กเกจ / Plan</TableHead><TableHead>ผู้ให้บริการ / Vendor</TableHead>
              <TableHead className="text-right">จำนวน / Qty</TableHead><TableHead className="text-right">ค่าใช้จ่าย / Cost</TableHead><TableHead>รอบ / Cycle</TableHead>
              <TableHead>ต่ออายุ / Renewal</TableHead><TableHead className="text-right">เหลือ / Days</TableHead><TableHead>สถานะ / Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {pageRows.length === 0 && <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">ไม่มีข้อมูล / No data</TableCell></TableRow>}
              {pageRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.serviceName}</TableCell>
                  <TableCell>{r.plan}</TableCell>
                  <TableCell>{r.vendor}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">฿{formatMoney(r.cost)}</TableCell>
                  <TableCell>{r.billingCycle}</TableCell>
                  <TableCell>{formatDate(r.renewalDate)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.daysLeft != null && r.daysLeft <= 30 ? "text-amber-600 dark:text-amber-400" : ""}`}>{r.daysLeft ?? "-"}</TableCell>
                  <TableCell><RenewalBadge days={r.daysLeft} status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination page={page} pageCount={pageCount} basePath="/reports/subscriptions" searchParams={sp} />
      </ChartCard>
    </div>
  );
}
