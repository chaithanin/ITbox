import Link from "next/link";
import { ArrowLeft, Download, AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { ReportHeader, ExecutiveSummary, ChartCard } from "@/components/report/ui";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { getWarranty } from "@/lib/services/reports";
import { Pagination, parsePage } from "@/components/list-controls";

export const dynamic = "force-dynamic";

function WarrantyBadge({ daysLeft }: { daysLeft: number }) {
  if (daysLeft < 0) return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><ShieldAlert className="h-3 w-3" /> หมดแล้ว / Expired</span>;
  if (daysLeft <= 7) return <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><ShieldAlert className="h-3 w-3" /> Critical</span>;
  if (daysLeft <= 30) return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"><AlertTriangle className="h-3 w-3" /> Warning</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3 w-3" /> OK</span>;
}

export default async function WarrantyDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;
  const w = await getWarranty(user.organizationId);

  // Bucket filter (from KPI click) + pagination over the sorted list.
  const bucket = sp.bucket;
  let rows = w.all;
  if (bucket === "expired") rows = rows.filter((r) => r.daysLeft < 0);
  else if (bucket === "30") rows = rows.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30);
  else if (bucket === "90") rows = rows.filter((r) => r.daysLeft > 30 && r.daysLeft <= 90);
  else if (bucket === "beyond") rows = rows.filter((r) => r.daysLeft > 90);
  else rows = w.actionable; // default: expired + ≤90, soonest first

  const { page, skip, take } = parsePage(sp.page);
  const pageRows = rows.slice(skip, skip + take);
  const pageCount = Math.max(1, Math.ceil(rows.length / take));

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/reports"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="แดชบอร์ดการรับประกัน / Warranty Expiration Dashboard" description="เรียงตามที่ใกล้หมดประกันที่สุด — คลิกการ์ดเพื่อกรองตามช่วง">
        <Button variant="outline" asChild><a href="/api/reports/warranty?format=xlsx"><Download className="h-4 w-4" /> Excel</a></Button>
        <Button variant="outline" asChild><a href="/api/reports/warranty?format=pdf"><Download className="h-4 w-4" /> PDF</a></Button>
      </PageHeader>

      <ReportHeader reportName="Warranty Expiration Report" period="ทรัพย์สินที่มีข้อมูลประกันทั้งหมด / All assets with warranty data" generatedBy={user.name} />

      <ExecutiveSummary>
        มีทรัพย์สินที่บันทึกข้อมูลประกัน <b>{w.counts.total.toLocaleString()}</b> รายการ —
        หมดประกันแล้ว <b>{w.counts.expired}</b>, จะหมดใน 30 วัน <b>{w.counts.within30}</b>,
        อีก 31–90 วัน {w.counts.within90}, และเกิน 90 วัน {w.counts.beyond90}.
        {w.counts.expired + w.counts.within30 > 0 ? " ควรวางแผนต่ออายุ/เปลี่ยนทดแทนสำหรับรายการเร่งด่วนด้านบน" : " ไม่มีรายการเร่งด่วน"}
      </ExecutiveSummary>

      <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="🔴 หมดแล้ว / Expired" value={w.counts.expired} tone={w.counts.expired > 0 ? "danger" : "default"} href="/reports/warranty?bucket=expired" />
        <StatCard label="🟠 ภายใน 30 วัน / ≤30 days" value={w.counts.within30} tone={w.counts.within30 > 0 ? "warning" : "default"} href="/reports/warranty?bucket=30" />
        <StatCard label="🟡 31–90 วัน / 31–90 days" value={w.counts.within90} href="/reports/warranty?bucket=90" />
        <StatCard label="🟢 เกิน 90 วัน / >90 days" value={w.counts.beyond90} tone="success" href="/reports/warranty?bucket=beyond" />
      </div>

      <ChartCard title={`รายการ / Detail (${rows.length.toLocaleString()})`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>แท็ก / Asset Tag</TableHead>
                <TableHead>ชื่อ / Name</TableHead>
                <TableHead>แผนก / Dept</TableHead>
                <TableHead>ผู้ขาย / Vendor</TableHead>
                <TableHead>เริ่มประกัน / Start</TableHead>
                <TableHead>หมดประกัน / End</TableHead>
                <TableHead className="text-right">เหลือ / Days Left</TableHead>
                <TableHead>สถานะ / Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">ไม่มีข้อมูล / No data</TableCell></TableRow>}
              {pageRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm"><Link href={`/assets/${r.id}`} className="text-primary hover:underline">{r.assetTag}</Link></TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell>{r.department}</TableCell>
                  <TableCell>{r.vendor}</TableCell>
                  <TableCell>{formatDate(r.warrantyStart)}</TableCell>
                  <TableCell>{formatDate(r.warrantyEnd)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.daysLeft < 0 ? "text-destructive" : r.daysLeft <= 30 ? "text-amber-600 dark:text-amber-400" : ""}`}>{r.daysLeft}</TableCell>
                  <TableCell><WarrantyBadge daysLeft={r.daysLeft} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination page={page} pageCount={pageCount} basePath="/reports/warranty" searchParams={sp} />
      </ChartCard>
    </div>
  );
}
