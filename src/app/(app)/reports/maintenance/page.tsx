import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { ReportHeader, ExecutiveSummary, ChartCard } from "@/components/report/ui";
import { Donut, Legend, HBars, type Segment } from "@/components/charts";
import { formatMoney } from "@/lib/utils";
import { getMaintenance } from "@/lib/services/reports";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = { OPEN: "#dc2626", IN_PROGRESS: "#d97706", WAITING_PART: "#f59e0b", WAITING_VENDOR: "#f97316", COMPLETED: "#16a34a", CANCELLED: "#9ca3af" };
const PRIORITY_COLOR: Record<string, string> = { URGENT: "#dc2626", HIGH: "#ea580c", MEDIUM: "#d97706", LOW: "#6b7280" };

export default async function MaintenanceDashboard() {
  const user = await requirePermission("report:read");
  const m = await getMaintenance(user.organizationId);

  const statusSeg: Segment[] = Object.entries(m.byStatus).map(([k, v]) => ({ label: k, value: v, color: STATUS_COLOR[k] ?? "#6b7280" }));
  const prioRows = Object.entries(m.byPriority).map(([k, v]) => ({ label: k, value: v, color: PRIORITY_COLOR[k] ?? "#6b7280" }));
  const costRows = m.costByMonth.map((c) => ({ label: c.month, value: Math.round(c.value), suffix: `฿${formatMoney(c.value)}` }));
  const topRows = m.topAssets.map((t) => ({ label: t.label, value: Math.round(t.value), suffix: `฿${formatMoney(t.value)}` }));

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/reports"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="แดชบอร์ดงานซ่อม / Maintenance Dashboard" description="สถานะงานซ่อม ความสำคัญ ค่าใช้จ่าย และทรัพย์สินที่ซ่อมบ่อย">
        <Button variant="outline" asChild><a href="/api/reports/maintenance?format=xlsx"><Download className="h-4 w-4" /> Excel</a></Button>
        <Button variant="outline" asChild><a href="/api/reports/maintenance?format=pdf"><Download className="h-4 w-4" /> PDF</a></Button>
      </PageHeader>
      <ReportHeader reportName="Maintenance Report" generatedBy={user.name} />
      <ExecutiveSummary>
        มีใบแจ้งซ่อมทั้งหมด <b>{m.total.toLocaleString()}</b> — เปิดค้าง <b>{m.open}</b>, กำลังดำเนินการ {m.inProgress},
        เสร็จแล้ว {m.completed}, ความสำคัญสูง/เร่งด่วน <b className={m.highPriority > 0 ? "text-amber-600 dark:text-amber-400" : ""}>{m.highPriority}</b>.
        ค่าซ่อมรวม <b>฿{formatMoney(m.totalCost)}</b>, เวลาซ่อมเฉลี่ย {m.avgResolutionHours} ชม.
      </ExecutiveSummary>

      <div className="mb-4 grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="ทั้งหมด / Total" value={m.total} href="/maintenance" />
        <StatCard label="เปิด / Open" value={m.open} tone={m.open > 0 ? "danger" : "default"} href="/maintenance" />
        <StatCard label="ดำเนินการ / In Progress" value={m.inProgress} tone={m.inProgress > 0 ? "warning" : "default"} href="/maintenance" />
        <StatCard label="เสร็จ / Completed" value={m.completed} tone="success" href="/maintenance" />
        <StatCard label="สำคัญสูง / High" value={m.highPriority} tone={m.highPriority > 0 ? "warning" : "default"} href="/maintenance" />
        <StatCard label="ค่าซ่อม / Repair Cost" value={`฿${formatMoney(m.totalCost)}`} href="/maintenance" />
        <StatCard label="เฉลี่ย / Avg Resolve" value={`${m.avgResolutionHours}h`} href="/maintenance" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="ตามสถานะ / By Status">
          {statusSeg.length ? <div className="flex flex-wrap items-center gap-6"><Donut segments={statusSeg} centerTop={m.total.toLocaleString()} centerSub="tickets" /><div className="min-w-[180px] flex-1"><Legend segments={statusSeg} total={m.total} /></div></div> : <p className="text-sm text-muted-foreground">ไม่มีข้อมูล</p>}
        </ChartCard>
        <ChartCard title="ตามความสำคัญ / By Priority">{prioRows.length ? <HBars rows={prioRows} /> : <p className="text-sm text-muted-foreground">ไม่มีข้อมูล</p>}</ChartCard>
        <ChartCard title="ค่าซ่อมรายเดือน / Repair Cost by Month">{costRows.length ? <HBars rows={costRows} /> : <p className="text-sm text-muted-foreground">ไม่มีข้อมูล</p>}</ChartCard>
        <ChartCard title="ทรัพย์สินที่ซ่อมมากสุด / Top Assets by Repair Cost">{topRows.length ? <HBars rows={topRows} /> : <p className="text-sm text-muted-foreground">ไม่มีข้อมูล</p>}</ChartCard>
      </div>
    </div>
  );
}
