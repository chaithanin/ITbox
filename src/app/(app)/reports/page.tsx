import Link from "next/link";
import { Download, LayoutGrid, Boxes, CheckCircle2, UserCheck, Wrench, AlertOctagon, Wallet, TrendingDown, ShieldAlert, Clock, ClipboardList, RefreshCcw } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { ChartCard, ExecutiveSummary, AlertList, ReportHeader, type AlertEntry } from "@/components/report/ui";
import { Donut, Legend, HBars, type Segment } from "@/components/charts";
import { formatMoney } from "@/lib/utils";
import {
  getAssetSummary, getWarranty, getBorrowing, getLicenses, getSubscriptions, getMaintenance, getProcurement,
  type AssetFilters,
} from "@/lib/services/reports";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  IN_USE: "#2563eb", ASSIGNED: "#4f46e5", AVAILABLE: "#16a34a", RESERVED: "#0891b2",
  BORROWED: "#7c3aed", IN_REPAIR: "#d97706", DAMAGED: "#ea580c", LOST: "#dc2626",
  STOLEN: "#b91c1c", RETIRED: "#6b7280", DISPOSED: "#9ca3af",
};
const CHART_PALETTE = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#4f46e5", "#059669", "#db2777", "#6b7280"];

export default async function ReportsDashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;
  const orgId = user.organizationId;

  const filters: AssetFilters = {
    departmentId: sp.departmentId || undefined,
    locationId: sp.locationId || undefined,
    categoryId: sp.categoryId || undefined,
    status: sp.status || undefined,
    condition: sp.condition || undefined,
  };

  const [assetsList, locationsList, categoriesList] = await Promise.all([
    prisma.department.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.assetCategory.findMany({ where: { organizationId: orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const departments = assetsList;

  const [asset, warranty, borrowing, licenses, subs, maint, proc] = await Promise.all([
    getAssetSummary(orgId, filters),
    getWarranty(orgId),
    getBorrowing(orgId),
    getLicenses(orgId),
    getSubscriptions(orgId),
    getMaintenance(orgId),
    getProcurement(orgId),
  ]);

  // Preserve active filters when drilling down into the asset list.
  const assetQs = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (filters.departmentId) q.set("departmentId", filters.departmentId);
    if (filters.locationId) q.set("locationId", filters.locationId);
    if (filters.categoryId) q.set("categoryId", filters.categoryId);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    const s = q.toString();
    return `/assets${s ? `?${s}` : ""}`;
  };

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
  const inUsePct = pct(asset.inUse, asset.total);

  // Charts
  const statusSegments: Segment[] = Object.entries(asset.status)
    .map(([k, v]) => ({ label: k, value: v, color: STATUS_COLOR[k] ?? "#6b7280" }))
    .sort((a, b) => b.value - a.value);
  const catRows = asset.byCategory.slice(0, 8).map((c, i) => ({ label: c.name, value: c.value, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  const deptRows = asset.byDepartment.slice(0, 8).map((c, i) => ({ label: c.name, value: c.value, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  const locRows = asset.byLocation.slice(0, 8).map((c, i) => ({ label: c.name, value: c.value, color: CHART_PALETTE[i % CHART_PALETTE.length] }));
  const condRows = Object.entries(asset.condition).map(([k, v], i) => ({ label: k, value: v, color: CHART_PALETTE[i % CHART_PALETTE.length] }));

  // Alert Center (built entirely from live data)
  const alerts: AlertEntry[] = [];
  if (warranty.counts.expired > 0) alerts.push({ severity: "critical", title: "ประกันหมดอายุแล้ว / Warranty expired", count: warranty.counts.expired, href: "/reports/warranty", detail: "ทรัพย์สินที่ยังใช้งานแต่ประกันหมดแล้ว" });
  if (warranty.counts.within30 > 0) alerts.push({ severity: "warning", title: "ประกันจะหมดใน 30 วัน / Warranty expiring ≤30d", count: warranty.counts.within30, href: "/reports/warranty" });
  if (borrowing.overdueCount > 0) alerts.push({ severity: "critical", title: "ยืมเกินกำหนดคืน / Overdue loans", count: borrowing.overdueCount, href: "/reports/borrowing" });
  if (licenses.expired > 0) alerts.push({ severity: "critical", title: "ไลเซนส์หมดอายุ / Licenses expired", count: licenses.expired, href: "/reports/licenses" });
  if (subs.expiringSoon > 0) alerts.push({ severity: "warning", title: "Subscription ใกล้ต่ออายุ ≤30d", count: subs.expiringSoon, href: "/reports/subscriptions" });
  if (maint.highPriority > 0) alerts.push({ severity: "warning", title: "งานซ่อมความสำคัญสูง / High-priority maintenance", count: maint.highPriority, href: "/reports/maintenance" });
  if (proc.pending > 0) alerts.push({ severity: "info", title: "คำขอจัดซื้อรออนุมัติ / Purchase requests pending", count: proc.pending, href: "/reports/procurement" });
  const critical = alerts.filter((a) => a.severity === "critical").length;

  const reportDate = sp.date || new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader title="IT Asset & IT Operations Dashboard" description="ภาพรวมสถานะ IT สำหรับผู้บริหาร — คลิก KPI/แจ้งเตือนเพื่อดูรายละเอียด">
        <Button variant="outline" asChild><Link href="/reports/warranty">การรับประกัน / Warranty</Link></Button>
        <Button variant="outline" asChild><Link href="/reports/export"><Download className="h-4 w-4" /> ส่งออกข้อมูลดิบ / Export</Link></Button>
      </PageHeader>

      <ReportHeader reportName="IT Asset & IT Operations Dashboard" period={`ณ วันที่ / As of ${reportDate}`} generatedBy={user.name} />

      {/* Report navigator */}
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          { href: "/reports/assets", label: "ทรัพย์สิน / Assets" },
          { href: "/reports/warranty", label: "การรับประกัน / Warranty" },
          { href: "/reports/borrowing", label: "ยืม-คืน / Borrowing" },
          { href: "/reports/maintenance", label: "งานซ่อม / Maintenance" },
          { href: "/reports/subscriptions", label: "Subscription" },
          { href: "/reports/licenses", label: "License" },
          { href: "/reports/procurement", label: "จัดซื้อ / Procurement" },
          ...(user.permissions.has("audit:read") ? [{ href: "/reports/vault-audit", label: "Vault Audit" }] : []),
        ].map((r) => (
          <Button key={r.href} variant="outline" size="sm" asChild><Link href={r.href}>{r.label}</Link></Button>
        ))}
      </div>

      {/* Filters */}
      <form method="get" className="mb-4 grid gap-2 rounded-lg border bg-card p-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">วันที่ / Report Date</span>
          <input type="date" name="date" defaultValue={reportDate} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">แผนก / Department</span>
          <select name="departmentId" defaultValue={filters.departmentId ?? ""} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">ทั้งหมด / All</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">สถานที่ / Location</span>
          <select name="locationId" defaultValue={filters.locationId ?? ""} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">ทั้งหมด / All</option>
            {locationsList.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">หมวดหมู่ / Category</span>
          <select name="categoryId" defaultValue={filters.categoryId ?? ""} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">ทั้งหมด / All</option>
            {categoriesList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">สถานะ / Status</span>
          <select name="status" defaultValue={filters.status ?? ""} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">ทั้งหมด / All</option>
            {Object.keys(STATUS_COLOR).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-muted-foreground">สภาพ / Condition</span>
          <select name="condition" defaultValue={filters.condition ?? ""} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm">
            <option value="">ทั้งหมด / All</option>
            {["NEW", "GOOD", "FAIR", "DAMAGED", "CRITICAL"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="flex gap-2 sm:col-span-3 lg:col-span-6">
          <Button type="submit" size="sm">ใช้ตัวกรอง / Apply</Button>
          <Button type="button" variant="ghost" size="sm" asChild><Link href="/reports">ล้าง / Reset</Link></Button>
        </div>
      </form>

      <ExecutiveSummary>
        ระบบมีทรัพย์สิน IT ทั้งหมด <b>{asset.total.toLocaleString()}</b> รายการ — ใช้งานอยู่ <b>{inUsePct}%</b> ({asset.inUse.toLocaleString()}),
        ว่าง {asset.available.toLocaleString()}, กำลังซ่อม {asset.inRepair.toLocaleString()}, สูญหาย {asset.lost.toLocaleString()}.
        มูลค่าซื้อรวม <b>฿{formatMoney(asset.totalPurchaseCost)}</b> (มูลค่าตามบัญชีปัจจุบัน ฿{formatMoney(asset.currentValue)}).
        {" "}มีประกันจะหมดใน 30 วัน <b>{warranty.counts.within30}</b> รายการ (หมดแล้ว {warranty.counts.expired}),
        ยืมเกินกำหนด {borrowing.overdueCount}, งานซ่อมค้าง {maint.open + maint.inProgress},
        ค่า Subscription ต่อปี ฿{formatMoney(subs.annualCost)}.
        {critical > 0 ? ` ⚠ มีรายการเร่งด่วน ${critical} กลุ่มที่ต้องดำเนินการ` : " ✔ ไม่มีรายการวิกฤติ"}
      </ExecutiveSummary>

      {/* KPI cards — each drills down */}
      <div className="mb-4 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="ทรัพย์สินทั้งหมด / Total" value={asset.total.toLocaleString()} href={assetQs({})} />
        <StatCard label="ใช้งาน / In Use" value={asset.inUse.toLocaleString()} sub={`${inUsePct}%`} tone="success" href={assetQs({ status: "IN_USE" })} />
        <StatCard label="ว่าง / Available" value={asset.available.toLocaleString()} href={assetQs({ status: "AVAILABLE" })} />
        <StatCard label="มอบหมาย / Assigned" value={asset.assigned.toLocaleString()} href={assetQs({ status: "ASSIGNED" })} />
        <StatCard label="กำลังซ่อม / In Repair" value={asset.inRepair.toLocaleString()} tone={asset.inRepair > 0 ? "warning" : "default"} href={assetQs({ status: "IN_REPAIR" })} />
        <StatCard label="สูญหาย / Lost" value={asset.lost.toLocaleString()} tone={asset.lost > 0 ? "danger" : "default"} href={assetQs({ status: "LOST" })} />
        <StatCard label="มูลค่าซื้อรวม / Total Cost" value={`฿${formatMoney(asset.totalPurchaseCost)}`} href={assetQs({})} />
        <StatCard label="มูลค่าปัจจุบัน / Current Value" value={`฿${formatMoney(asset.currentValue)}`} href={assetQs({})} />
        <StatCard label="ประกันใกล้หมด / Warranty ≤30d" value={warranty.counts.within30} tone={warranty.counts.within30 > 0 ? "warning" : "default"} href="/reports/warranty" />
        <StatCard label="ยืมเกินกำหนด / Overdue" value={borrowing.overdueCount} tone={borrowing.overdueCount > 0 ? "danger" : "default"} href="/reports/borrowing" />
        <StatCard label="งานซ่อมค้าง / Open Maint." value={maint.open + maint.inProgress} tone={(maint.open + maint.inProgress) > 0 ? "warning" : "default"} href="/reports/maintenance" />
        <StatCard label="Subscription/ปี / Annual" value={`฿${formatMoney(subs.annualCost)}`} href="/reports/subscriptions" />
      </div>

      {/* Charts */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="ทรัพย์สินตามสถานะ / Assets by Status">
          <div className="flex flex-wrap items-center gap-6">
            <Donut segments={statusSegments} centerTop={asset.total.toLocaleString()} centerSub="รายการ / items" />
            <div className="min-w-[200px] flex-1"><Legend segments={statusSegments} total={asset.total} /></div>
          </div>
        </ChartCard>
        <ChartCard title="ทรัพย์สินตามหมวดหมู่ / Assets by Category"><HBars rows={catRows} /></ChartCard>
        <ChartCard title="ทรัพย์สินตามแผนก / Assets by Department"><HBars rows={deptRows} /></ChartCard>
        <ChartCard title="ทรัพย์สินตามสถานที่ / Assets by Location"><HBars rows={locRows} /></ChartCard>
        <ChartCard title="ทรัพย์สินตามสภาพ / Assets by Condition" className="lg:col-span-2"><HBars rows={condRows} /></ChartCard>
      </div>

      {/* Operations KPIs + Alert Center */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <p className="mb-3 text-sm font-semibold">สรุปการดำเนินงาน / Operations</p>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
              <MiniStat icon={<Boxes className="h-4 w-4" />} label="License ใช้ไป / Utilization" value={`${licenses.utilization}%`} sub={`${licenses.assigned}/${licenses.totalSeats}`} href="/reports/licenses" />
              <MiniStat icon={<RefreshCcw className="h-4 w-4" />} label="Subscription active" value={subs.active} href="/reports/subscriptions" />
              <MiniStat icon={<ClipboardList className="h-4 w-4" />} label="จัดซื้อรออนุมัติ / PR pending" value={proc.pending} href="/reports/procurement" />
              <MiniStat icon={<Wrench className="h-4 w-4" />} label="ซ่อมเสร็จ / Completed" value={maint.completed} href="/reports/maintenance" />
              <MiniStat icon={<UserCheck className="h-4 w-4" />} label="กำลังยืม / Active loans" value={borrowing.active} href="/reports/borrowing" />
              <MiniStat icon={<Wallet className="h-4 w-4" />} label="ค่าซ่อมรวม / Repair cost" value={`฿${formatMoney(maint.totalCost)}`} href="/reports/maintenance" />
              <MiniStat icon={<Clock className="h-4 w-4" />} label="เฉลี่ยเวลาซ่อม / Avg resolve" value={`${maint.avgResolutionHours}h`} href="/reports/maintenance" />
              <MiniStat icon={<TrendingDown className="h-4 w-4" />} label="License ใช้น้อย / Underused" value={licenses.rows.filter((r) => r.flag === "UNDERUTILIZED").length} href="/reports/licenses" />
            </div>
          </CardContent>
        </Card>
        <ChartCard title="ศูนย์แจ้งเตือน / Alert Center" action={critical > 0 ? <span className="flex items-center gap-1 text-xs font-semibold text-destructive"><ShieldAlert className="h-3.5 w-3.5" />{critical}</span> : undefined}>
          <AlertList alerts={alerts} />
        </ChartCard>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <LayoutGrid className="mr-1 inline h-3 w-3" /> ต้องการข้อมูลดิบ? ไปที่{" "}
        <Link href="/reports/export" className="text-primary hover:underline">ส่งออกข้อมูลดิบ / Raw Data Export</Link>
        {" · "}<AlertOctagon className="mr-1 inline h-3 w-3" />ตัวเลขทั้งหมดคำนวณจากฐานข้อมูลจริงแบบเรียลไทม์
      </p>
    </div>
  );
}

function MiniStat({ icon, label, value, sub, href }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; href?: string }) {
  const inner = (
    <div className="rounded-md border bg-muted/20 p-3 transition-shadow hover:shadow-sm">
      <div className="flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[11px]">{label}</span></div>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
