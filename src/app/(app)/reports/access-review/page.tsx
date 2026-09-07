import Link from "next/link";
import { ArrowLeft, Download, AlertTriangle, ShieldAlert, CheckCircle2, FileClock, FilePlus2 } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { ReportHeader, ExecutiveSummary, ChartCard, AlertList, type AlertEntry } from "@/components/report/ui";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { getAccessReview, type ReviewBucket } from "@/lib/services/reports";
import { Pagination, parsePage } from "@/components/list-controls";

export const dynamic = "force-dynamic";

const BUCKET_META: Record<ReviewBucket, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  overdue: { label: "เกินกำหนดทบทวน / Overdue", cls: "bg-destructive/10 text-destructive", icon: ShieldAlert },
  dueSoon: { label: "ใกล้ครบกำหนด / Due soon", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400", icon: AlertTriangle },
  ok: { label: "ปกติ / OK", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
  draft: { label: "ฉบับร่าง / Draft", cls: "bg-muted text-muted-foreground", icon: FileClock },
  closed: { label: "ปิด/ยกเลิก / Closed", cls: "bg-muted text-muted-foreground", icon: FileClock },
};

function ReviewBadge({ bucket }: { bucket: ReviewBucket }) {
  const m = BUCKET_META[bucket];
  const Icon = m.icon;
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}><Icon className="h-3 w-3" /> {m.label}</span>;
}

export default async function AccessReviewDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("accessreq:read");
  const sp = await searchParams;
  const r = await getAccessReview(user.organizationId);
  const c = r.counts;

  const alerts: AlertEntry[] = [];
  if (c.overdue > 0) alerts.push({ severity: "critical", title: "เอกสารสิทธิ์เกินกำหนดทบทวน / Access documents overdue for review", count: c.overdue, href: "/reports/access-review?bucket=overdue", detail: "เอกสารมีอายุเกิน 1 ปี ควรทบทวนและยื่นใหม่" });
  if (c.dueSoon > 0) alerts.push({ severity: "warning", title: "ใกล้ครบกำหนดทบทวนใน 30 วัน / Review due ≤30 days", count: c.dueSoon, href: "/reports/access-review?bucket=dueSoon" });
  if (c.employeesNoDoc > 0) alerts.push({ severity: "info", title: "พนักงานที่ยังไม่มีเอกสารคำขอสิทธิ์ / Active staff without an access document", count: c.employeesNoDoc, href: "/reports/access-review?view=nodoc", detail: "สร้างเอกสารคำขอสิทธิ์จากโปรไฟล์เริ่มต้นได้จากหน้าพนักงาน" });

  // View: default = review list (bucket-filtered); view=nodoc = employees without a document.
  const view = sp.view === "nodoc" ? "nodoc" : "review";
  const bucket = sp.bucket as ReviewBucket | undefined;

  let rows = r.rows;
  if (bucket && BUCKET_META[bucket]) rows = rows.filter((row) => row.bucket === bucket);

  const { page, skip, take } = parsePage(sp.page);
  const listLen = view === "nodoc" ? r.noDoc.length : rows.length;
  const pageCount = Math.max(1, Math.ceil(listLen / take));
  const pageRows = rows.slice(skip, skip + take);
  const pageNoDoc = r.noDoc.slice(skip, skip + take);

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/reports"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="รายงานทบทวนสิทธิ์ / Access Review Report" description="ทบทวนเอกสารคำขอสิทธิ์ที่บันทึกไว้ — เอกสารมีอายุ 1 ปี ควรทบทวน/ยื่นใหม่เมื่อครบกำหนด (เป็นเอกสารเท่านั้น ไม่กระทบสิทธิ์ระบบจริง)">
        <Button variant="outline" asChild><a href="/api/reports/access-review?format=xlsx"><Download className="h-4 w-4" /> Excel</a></Button>
        <Button variant="outline" asChild><a href="/api/reports/access-review?format=pdf"><Download className="h-4 w-4" /> PDF</a></Button>
      </PageHeader>

      <ReportHeader reportName="Access Review / Access-Right Recertification" period={`เอกสารคำขอสิทธิ์ทั้งหมด ${c.totalDocs.toLocaleString()} ฉบับ / All recorded access-request documents`} generatedBy={user.name} />

      <ExecutiveSummary>
        มีเอกสารคำขอสิทธิ์ที่บันทึกไว้ <b>{c.totalDocs.toLocaleString()}</b> ฉบับ —
        เกินกำหนดทบทวน <b>{c.overdue}</b>, ใกล้ครบกำหนดใน 30 วัน <b>{c.dueSoon}</b>,
        ปกติ {c.ok}, ฉบับร่าง {c.draft}, ปิด/ยกเลิก {c.closed}.
        พนักงานที่ยังใช้งาน <b>{c.activeEmployees.toLocaleString()}</b> คน มีเอกสารแล้ว {c.employeesWithDoc} คน
        และยังไม่มีเอกสาร <b>{c.employeesNoDoc}</b> คน.
        {c.overdue + c.dueSoon > 0 ? " ควรดำเนินการทบทวน/ยื่นเอกสารใหม่สำหรับรายการเร่งด่วนด้านบน" : " ไม่มีรายการเร่งด่วน"}
      </ExecutiveSummary>

      {alerts.length > 0 && (
        <ChartCard title="การแจ้งเตือน / Alerts" className="mb-4">
          <AlertList alerts={alerts} />
        </ChartCard>
      )}

      <div className="mb-4 grid gap-3 grid-cols-2 lg:grid-cols-6">
        <StatCard label="🔴 เกินกำหนด / Overdue" value={c.overdue} tone={c.overdue > 0 ? "danger" : "default"} href="/reports/access-review?bucket=overdue" />
        <StatCard label="🟠 ใกล้ครบ / Due ≤30d" value={c.dueSoon} tone={c.dueSoon > 0 ? "warning" : "default"} href="/reports/access-review?bucket=dueSoon" />
        <StatCard label="🟢 ปกติ / OK" value={c.ok} tone="success" href="/reports/access-review?bucket=ok" />
        <StatCard label="📝 ฉบับร่าง / Draft" value={c.draft} href="/reports/access-review?bucket=draft" />
        <StatCard label="📄 ทั้งหมด / All docs" value={c.totalDocs} href="/reports/access-review" />
        <StatCard label="👤 ยังไม่มีเอกสาร / No doc" value={c.employeesNoDoc} tone={c.employeesNoDoc > 0 ? "warning" : "default"} href="/reports/access-review?view=nodoc" />
      </div>

      {/* View switch */}
      <div className="mb-3 flex flex-wrap gap-2 no-print">
        <Button variant={view === "review" ? "default" : "outline"} size="sm" asChild><Link href="/reports/access-review"><FileClock className="h-4 w-4" /> เอกสารที่ต้องทบทวน / Review list</Link></Button>
        <Button variant={view === "nodoc" ? "default" : "outline"} size="sm" asChild><Link href="/reports/access-review?view=nodoc"><FilePlus2 className="h-4 w-4" /> พนักงานที่ยังไม่มีเอกสาร / Without document ({c.employeesNoDoc})</Link></Button>
      </div>

      {view === "review" ? (
        <ChartCard title={`เอกสารคำขอสิทธิ์ / Access documents (${rows.length.toLocaleString()})${bucket && BUCKET_META[bucket] ? ` — ${BUCKET_META[bucket].label}` : ""}`}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่ / Ref</TableHead>
                  <TableHead>รหัส / Code</TableHead>
                  <TableHead>ชื่อ / Name</TableHead>
                  <TableHead>แผนก / Dept</TableHead>
                  <TableHead>ตำแหน่ง / Position</TableHead>
                  <TableHead className="text-right">รายการ / Items</TableHead>
                  <TableHead>มีผล / Effective</TableHead>
                  <TableHead>ครบกำหนดทบทวน / Review due</TableHead>
                  <TableHead className="text-right">เหลือ / Days</TableHead>
                  <TableHead>สถานะทบทวน / Review</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.length === 0 && <TableRow><TableCell colSpan={10} className="py-8 text-center text-muted-foreground">ไม่มีข้อมูล / No data</TableCell></TableRow>}
                {pageRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs"><Link href={`/access-requests/${row.id}`} className="text-primary hover:underline">{row.refNo || row.id.slice(0, 8)}</Link></TableCell>
                    <TableCell className="font-mono text-sm">{row.employeeCode}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.department}</TableCell>
                    <TableCell>{row.position}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.itemCount}</TableCell>
                    <TableCell>{formatDate(row.effectiveDate)}</TableCell>
                    <TableCell>{formatDate(row.reviewDue)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${row.daysToReview !== null && row.daysToReview < 0 ? "text-destructive" : row.daysToReview !== null && row.daysToReview <= 30 ? "text-amber-600 dark:text-amber-400" : ""}`}>{row.daysToReview ?? "—"}</TableCell>
                    <TableCell><ReviewBadge bucket={row.bucket} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} pageCount={pageCount} basePath="/reports/access-review" searchParams={sp} />
        </ChartCard>
      ) : (
        <ChartCard title={`พนักงานที่ยังไม่มีเอกสารคำขอสิทธิ์ / Active staff without a document (${r.noDoc.length.toLocaleString()})`}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัส / Code</TableHead>
                  <TableHead>ชื่อ / Name</TableHead>
                  <TableHead>แผนก / Dept</TableHead>
                  <TableHead>ตำแหน่ง / Position</TableHead>
                  <TableHead className="text-right no-print">การทำงาน / Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageNoDoc.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">พนักงานที่ใช้งานอยู่มีเอกสารครบทุกคน / All active staff have a document</TableCell></TableRow>}
                {pageNoDoc.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-sm">{e.employeeCode}</TableCell>
                    <TableCell>{e.name}</TableCell>
                    <TableCell>{e.department}</TableCell>
                    <TableCell>{e.position}</TableCell>
                    <TableCell className="text-right no-print"><Link href={`/employees/${e.id}`} className="text-primary hover:underline text-xs">สร้างเอกสาร / Create</Link></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination page={page} pageCount={pageCount} basePath="/reports/access-review" searchParams={sp} />
        </ChartCard>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        หมายเหตุ: รายงานนี้ทบทวน “เอกสารคำขอสิทธิ์” ที่บันทึกไว้เท่านั้น ไม่ได้อ่านหรือเปลี่ยนแปลงสิทธิ์การใช้งานระบบจริงแต่อย่างใด /
        Note: this report reviews recorded access-request documents only; it neither reads nor modifies any real system permission.
      </p>
    </div>
  );
}
