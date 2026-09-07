import Link from "next/link";
import { ArrowLeft, Download, AlertTriangle, ShieldAlert, CheckCircle2, TrendingDown } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { ReportHeader, ExecutiveSummary, ChartCard } from "@/components/report/ui";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Meter } from "@/components/charts";
import { formatMoney, formatDate } from "@/lib/utils";
import { getLicenses } from "@/lib/services/reports";
import { Pagination, parsePage } from "@/components/list-controls";

export const dynamic = "force-dynamic";

function FlagBadge({ flag }: { flag: "OK" | "UNDERUTILIZED" | "FULL" | "EXPIRED" }) {
  if (flag === "EXPIRED") return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><ShieldAlert className="h-3 w-3" /> หมดอายุ / Expired</span>;
  if (flag === "FULL") return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3 w-3" /> เต็ม / Capacity Reached</span>;
  if (flag === "UNDERUTILIZED") return <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400"><TrendingDown className="h-3 w-3" /> ใช้น้อย / Underutilized</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> OK</span>;
}

export default async function LicenseReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;
  const l = await getLicenses(user.organizationId);
  const { page, skip, take } = parsePage(sp.page);
  const pageRows = l.rows.slice(skip, skip + take);
  const pageCount = Math.max(1, Math.ceil(l.rows.length / take));
  const underused = l.rows.filter((r) => r.flag === "UNDERUTILIZED").length;

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/reports"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="แดชบอร์ดไลเซนส์ / Software License Dashboard" description="การใช้งานที่นั่ง วันหมดอายุ และการใช้ทรัพยากรอย่างคุ้มค่า">
        <Button variant="outline" asChild><a href="/api/reports/licenses?format=xlsx"><Download className="h-4 w-4" /> Excel</a></Button>
      </PageHeader>
      <ReportHeader reportName="Software License Report" generatedBy={user.name} />
      <ExecutiveSummary>
        มีไลเซนส์ <b>{l.totalLicenses}</b> รายการ ({l.totalSeats} ที่นั่ง) — ใช้ไป <b>{l.assigned}</b> ({l.utilization}%), ว่าง {l.available}.
        หมดอายุแล้ว <b className={l.expired > 0 ? "text-destructive" : ""}>{l.expired}</b>, ใช้ไม่คุ้ม (&lt;50%) {underused} รายการ.
      </ExecutiveSummary>
      <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-5">
        <StatCard label="ทั้งหมด / Total" value={l.totalLicenses} href="/licenses" />
        <StatCard label="ใช้ไป / Assigned" value={l.assigned} href="/licenses" />
        <StatCard label="ว่าง / Available" value={l.available} tone="success" href="/licenses" />
        <StatCard label="หมดอายุ / Expired" value={l.expired} tone={l.expired > 0 ? "danger" : "default"} href="/licenses" />
        <StatCard label="การใช้งาน / Utilization" value={`${l.utilization}%`} href="/licenses" />
      </div>
      <ChartCard title={`รายการ / Detail (${l.rows.length})`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>ซอฟต์แวร์ / Software</TableHead><TableHead>ประเภท / Type</TableHead><TableHead>ผู้ขาย / Vendor</TableHead>
              <TableHead className="text-right">ที่นั่ง / Seats</TableHead><TableHead className="w-40">การใช้งาน / Utilization</TableHead>
              <TableHead>หมดอายุ / Expires</TableHead><TableHead className="text-right">เหลือ / Days</TableHead><TableHead>สถานะ / Flag</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {pageRows.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">ไม่มีข้อมูล / No data</TableCell></TableRow>}
              {pageRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.softwareName}</TableCell>
                  <TableCell>{r.licenseType}</TableCell>
                  <TableCell>{r.vendor}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.used}/{r.totalSeats}</TableCell>
                  <TableCell><div className="flex items-center gap-2"><Meter percent={r.utilization} color={r.utilization >= 100 ? "#d97706" : r.utilization < 50 ? "#2563eb" : "#16a34a"} /><span className="w-10 text-right text-xs tabular-nums">{r.utilization}%</span></div></TableCell>
                  <TableCell>{formatDate(r.expiresAt)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.daysLeft != null && r.daysLeft < 0 ? "text-destructive" : ""}`}>{r.daysLeft ?? "-"}</TableCell>
                  <TableCell><FlagBadge flag={r.flag} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination page={page} pageCount={pageCount} basePath="/reports/licenses" searchParams={sp} />
      </ChartCard>
      <p className="mt-3 text-xs text-muted-foreground">ค่าไลเซนส์รวม ฿{formatMoney(l.rows.reduce((s, r) => s + r.cost, 0))} · ค่าต่ออายุรวม ฿{formatMoney(l.rows.reduce((s, r) => s + r.renewalCost, 0))}</p>
    </div>
  );
}
