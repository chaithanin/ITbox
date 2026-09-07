import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { ReportHeader, ExecutiveSummary, ChartCard } from "@/components/report/ui";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { getBorrowing } from "@/lib/services/reports";
import { Pagination, parsePage } from "@/components/list-controls";

export const dynamic = "force-dynamic";

export default async function BorrowingDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;
  const b = await getBorrowing(user.organizationId);

  const { page, skip, take } = parsePage(sp.page);
  const pageRows = b.overdue.slice(skip, skip + take);
  const pageCount = Math.max(1, Math.ceil(b.overdue.length / take));

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/reports"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="แดชบอร์ดยืม-คืน / Borrowing Dashboard" description="รวมการใช้งาน เกินกำหนด และคำขอยืม ไว้ในที่เดียว">
        <Button variant="outline" asChild><a href="/api/reports/borrow-overdue?format=xlsx">Overdue · Excel</a></Button>
        <Button variant="outline" asChild><a href="/api/reports/borrow-requests?format=xlsx">Requests · Excel</a></Button>
      </PageHeader>
      <ReportHeader reportName="Borrowing / Loan Report" generatedBy={user.name} />
      <ExecutiveSummary>
        มีคำขอยืมทั้งหมด <b>{b.totalRequests.toLocaleString()}</b> รายการ — กำลังยืมอยู่ <b>{b.active}</b>,
        คืนแล้ว {b.returned}, <b className={b.overdueCount > 0 ? "text-destructive" : ""}>เกินกำหนด {b.overdueCount}</b>,
        และรออนุมัติ {b.pending}. {b.overdueCount > 0 ? "โปรดติดตามรายการเกินกำหนดด้านล่าง (เรียงจากเกินมากสุด)" : "ไม่มีรายการเกินกำหนด"}
      </ExecutiveSummary>

      <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-5">
        <StatCard label="ทั้งหมด / Total" value={b.totalRequests} href="/borrow" />
        <StatCard label="กำลังยืม / Active" value={b.active} tone="default" href="/borrow" />
        <StatCard label="คืนแล้ว / Returned" value={b.returned} tone="success" href="/borrow" />
        <StatCard label="เกินกำหนด / Overdue" value={b.overdueCount} tone={b.overdueCount > 0 ? "danger" : "default"} href="/borrow" />
        <StatCard label="รออนุมัติ / Pending" value={b.pending} tone={b.pending > 0 ? "warning" : "default"} href="/borrow" />
      </div>

      <ChartCard title={`เกินกำหนดคืน / Overdue (${b.overdue.length})`}>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เลขที่ / Ref</TableHead>
                <TableHead>ผู้ยืม / Borrower</TableHead>
                <TableHead>แผนก / Dept</TableHead>
                <TableHead>ทรัพย์สิน / Assets</TableHead>
                <TableHead>วันยืม / Borrowed</TableHead>
                <TableHead>ครบกำหนด / Due</TableHead>
                <TableHead className="text-right">เกิน (วัน) / Overdue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">ไม่มีรายการเกินกำหนด / No overdue loans</TableCell></TableRow>}
              {pageRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-sm"><Link href={`/borrow/${r.id}`} className="text-primary hover:underline">{r.refNo}</Link></TableCell>
                  <TableCell>{r.borrower}</TableCell>
                  <TableCell>{r.department}</TableCell>
                  <TableCell className="max-w-[240px] truncate" title={r.assets}>{r.assets || "-"}</TableCell>
                  <TableCell>{formatDate(r.borrowDate)}</TableCell>
                  <TableCell>{formatDate(r.dueDate)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-destructive">{r.daysOverdue}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination page={page} pageCount={pageCount} basePath="/reports/borrowing" searchParams={sp} />
      </ChartCard>
    </div>
  );
}
