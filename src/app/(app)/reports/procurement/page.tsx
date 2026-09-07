import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { ReportHeader, ExecutiveSummary, ChartCard } from "@/components/report/ui";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatMoney, formatDate } from "@/lib/utils";
import { getProcurement } from "@/lib/services/reports";
import { Pagination, parsePage } from "@/components/list-controls";

export const dynamic = "force-dynamic";

export default async function ProcurementReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;
  const p = await getProcurement(user.organizationId);
  const { page, skip, take } = parsePage(sp.page);
  const pageRows = p.pendingList.slice(skip, skip + take);
  const pageCount = Math.max(1, Math.ceil(p.pendingList.length / take));

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/reports"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="แดชบอร์ดจัดซื้อ / IT Procurement Dashboard" description="คำขอจัดซื้อ งบประมาณ และรายการที่รออนุมัติ">
        <Button variant="outline" asChild><a href="/api/reports/purchases?format=xlsx"><Download className="h-4 w-4" /> Excel</a></Button>
      </PageHeader>
      <ReportHeader reportName="IT Procurement Report" generatedBy={user.name} />
      <ExecutiveSummary>
        มีคำขอจัดซื้อทั้งหมด <b>{p.total}</b> — รออนุมัติ <b className={p.pending > 0 ? "text-amber-600 dark:text-amber-400" : ""}>{p.pending}</b>,
        อนุมัติแล้ว {p.approved}, ปฏิเสธ {p.rejected}. งบประมาณโดยประมาณรวม <b>฿{formatMoney(p.estimatedBudget)}</b>
        (ที่อนุมัติแล้ว ฿{formatMoney(p.approvedBudget)}).
      </ExecutiveSummary>
      <div className="mb-4 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="ทั้งหมด / Total" value={p.total} href="/procurement" />
        <StatCard label="รออนุมัติ / Pending" value={p.pending} tone={p.pending > 0 ? "warning" : "default"} href="/procurement" />
        <StatCard label="อนุมัติ / Approved" value={p.approved} tone="success" href="/procurement" />
        <StatCard label="ปฏิเสธ / Rejected" value={p.rejected} href="/procurement" />
        <StatCard label="งบประมาณ / Estimated" value={`฿${formatMoney(p.estimatedBudget)}`} href="/procurement" />
        <StatCard label="อนุมัติแล้ว / Approved ฿" value={`฿${formatMoney(p.approvedBudget)}`} href="/procurement" />
      </div>
      <ChartCard title={`รออนุมัติ / Pending Approval (${p.pendingList.length})`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>เลขที่ / Request No</TableHead><TableHead>แผนก / Dept</TableHead><TableHead>ผู้ขาย / Vendor</TableHead>
              <TableHead className="text-right">รายการ / Items</TableHead><TableHead className="text-right">ประมาณการ / Estimated</TableHead>
              <TableHead>สถานะ / Status</TableHead><TableHead>สร้างเมื่อ / Created</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {pageRows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">ไม่มีรายการรออนุมัติ / No pending requests</TableCell></TableRow>}
              {pageRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm"><Link href={`/procurement/${r.id}`} className="text-primary hover:underline">{r.requestNumber}</Link></TableCell>
                  <TableCell>{r.department}</TableCell>
                  <TableCell>{r.vendor}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.items}</TableCell>
                  <TableCell className="text-right tabular-nums">฿{formatMoney(r.estimated)}</TableCell>
                  <TableCell><span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">{r.status}</span></TableCell>
                  <TableCell>{formatDate(r.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination page={page} pageCount={pageCount} basePath="/reports/procurement" searchParams={sp} />
      </ChartCard>
    </div>
  );
}
