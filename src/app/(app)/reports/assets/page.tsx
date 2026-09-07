import Link from "next/link";
import { ArrowLeft, Download, Copy, ArrowUpDown } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { ReportHeader, ExecutiveSummary, ChartCard } from "@/components/report/ui";
import { PrintButton } from "@/components/report/print-button";
import { Donut, Legend, HBars, type Segment } from "@/components/charts";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatMoney, formatDate, daysUntil, currentBookValue } from "@/lib/utils";
import { getAssetSummary, getDepartmentOverview, getDuplicateAssets, type AssetFilters } from "@/lib/services/reports";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  IN_USE: "#2563eb", ASSIGNED: "#4f46e5", AVAILABLE: "#16a34a", RESERVED: "#0891b2",
  BORROWED: "#7c3aed", IN_REPAIR: "#d97706", DAMAGED: "#ea580c", LOST: "#dc2626",
  STOLEN: "#b91c1c", RETIRED: "#6b7280", DISPOSED: "#9ca3af",
};
const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#dc2626", "#4f46e5", "#059669", "#db2777", "#6b7280"];
const ASSET_STATUSES = Object.keys(STATUS_COLOR);
const SORTABLE = ["assetTag", "name", "status", "purchasePrice", "warrantyEnd"] as const;

export default async function AssetReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
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
  const q = sp.q?.trim() || undefined;
  const sort = (SORTABLE as readonly string[]).includes(sp.sort ?? "") ? sp.sort! : "displayOrder";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const { page, skip, take } = parsePage(sp.page);

  const [summary, deptOverview, dups, departments, locations, categories] = await Promise.all([
    getAssetSummary(orgId, filters),
    getDepartmentOverview(orgId),
    getDuplicateAssets(orgId),
    prisma.department.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.assetCategory.findMany({ where: { organizationId: orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const where: Prisma.AssetWhereInput = {
    organizationId: orgId, deletedAt: null,
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.status ? { status: filters.status as Prisma.EnumAssetStatusFilter["equals"] } : {}),
    ...(filters.condition ? { condition: filters.condition as Prisma.EnumAssetConditionFilter["equals"] } : {}),
    ...(q ? { OR: [{ assetTag: { contains: q, mode: "insensitive" } }, { serialNumber: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const orderBy: Prisma.AssetOrderByWithRelationInput = sort === "displayOrder"
    ? { displayOrder: { sort: "asc", nulls: "last" } }
    : ({ [sort]: dir } as Prisma.AssetOrderByWithRelationInput);

  const [rows, total] = await Promise.all([
    prisma.asset.findMany({
      where, orderBy, skip, take,
      select: {
        id: true, assetTag: true, name: true, brand: true, model: true, status: true, condition: true,
        purchaseDate: true, purchasePrice: true, currentValue: true, depreciationMonths: true, warrantyEnd: true,
        category: { select: { name: true } }, department: { select: { name: true } },
        location: { select: { name: true } }, vendor: { select: { name: true } },
      },
    }),
    prisma.asset.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / take));

  const statusSeg: Segment[] = Object.entries(summary.status).map(([k, v]) => ({ label: k, value: v, color: STATUS_COLOR[k] ?? "#6b7280" })).sort((a, b) => b.value - a.value);
  const catRows = summary.byCategory.slice(0, 8).map((c, i) => ({ label: c.name, value: c.value, color: PALETTE[i % PALETTE.length] }));
  const deptRows = summary.byDepartment.slice(0, 8).map((c, i) => ({ label: c.name, value: c.value, color: PALETTE[i % PALETTE.length] }));
  const locRows = summary.byLocation.slice(0, 8).map((c, i) => ({ label: c.name, value: c.value, color: PALETTE[i % PALETTE.length] }));

  // Sort header link — toggles dir, preserves other params.
  const sortHref = (col: string) => {
    const p = new URLSearchParams(sp as Record<string, string>);
    p.set("sort", col);
    p.set("dir", sort === col && dir === "asc" ? "desc" : "asc");
    p.delete("page");
    return `/reports/assets?${p.toString()}`;
  };
  const SortHead = ({ col, children, className }: { col: string; children: React.ReactNode; className?: string }) => (
    <TableHead className={className}><Link href={sortHref(col)} className="inline-flex items-center gap-1 hover:text-foreground">{children}<ArrowUpDown className="h-3 w-3 opacity-50" /></Link></TableHead>
  );

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/reports"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="รายงานทรัพย์สิน / Asset Report" description="สรุป → กราฟ → รายละเอียด (รวมทะเบียน, ตามแผนก และรายการซ้ำไว้ในที่เดียว)">
        <PrintButton label="พิมพ์/บันทึก PDF" />
        <Button variant="outline" asChild className="no-print"><a href="/api/reports/assets?format=xlsx"><Download className="h-4 w-4" /> Excel</a></Button>
        <Button variant="outline" asChild className="no-print"><a href="/api/reports/assets?format=pdf"><Download className="h-4 w-4" /> PDF</a></Button>
      </PageHeader>
      <ReportHeader reportName="IT Asset Report" generatedBy={user.name} />

      <ExecutiveSummary>
        ทรัพย์สินทั้งหมด <b>{summary.total.toLocaleString()}</b> รายการ — ใช้งาน {summary.inUse.toLocaleString()}, ว่าง {summary.available.toLocaleString()},
        กำลังซ่อม {summary.inRepair.toLocaleString()}, สูญหาย {summary.lost.toLocaleString()}, ปลดระวาง {summary.retired.toLocaleString()}.
        มูลค่าซื้อรวม <b>฿{formatMoney(summary.totalPurchaseCost)}</b>, มูลค่าตามบัญชีปัจจุบัน <b>฿{formatMoney(summary.currentValue)}</b>.
        {dups.count > 0 ? ` พบทรัพย์สิน serial ซ้ำ ${dups.count} กลุ่ม ควรตรวจสอบ` : " ไม่พบ serial number ซ้ำ"}
      </ExecutiveSummary>

      {/* Section A — Summary */}
      <div className="mb-4 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="ทั้งหมด / Total" value={summary.total.toLocaleString()} />
        <StatCard label="ใช้งาน / In Use" value={summary.inUse.toLocaleString()} tone="success" />
        <StatCard label="ว่าง / Available" value={summary.available.toLocaleString()} />
        <StatCard label="มอบหมาย / Assigned" value={summary.assigned.toLocaleString()} />
        <StatCard label="กำลังซ่อม / In Repair" value={summary.inRepair.toLocaleString()} tone={summary.inRepair > 0 ? "warning" : "default"} />
        <StatCard label="สูญหาย / Lost" value={summary.lost.toLocaleString()} tone={summary.lost > 0 ? "danger" : "default"} />
        <StatCard label="ปลดระวาง / Retired" value={summary.retired.toLocaleString()} />
        <StatCard label="มูลค่าซื้อ / Purchase Cost" value={`฿${formatMoney(summary.totalPurchaseCost)}`} />
        <StatCard label="มูลค่าปัจจุบัน / Book Value" value={`฿${formatMoney(summary.currentValue)}`} />
        <StatCard label="Serial ซ้ำ / Duplicates" value={dups.count} tone={dups.count > 0 ? "warning" : "default"} />
      </div>

      {/* Section B — Charts */}
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="ตามสถานะ / By Status"><div className="flex flex-wrap items-center gap-6"><Donut segments={statusSeg} centerTop={summary.total.toLocaleString()} centerSub="items" /><div className="min-w-[180px] flex-1"><Legend segments={statusSeg} total={summary.total} /></div></div></ChartCard>
        <ChartCard title="ตามหมวดหมู่ / By Category"><HBars rows={catRows} /></ChartCard>
        <ChartCard title="ตามแผนก / By Department"><HBars rows={deptRows} /></ChartCard>
        <ChartCard title="ตามสถานที่ / By Location"><HBars rows={locRows} /></ChartCard>
      </div>

      {/* Department overview */}
      <ChartCard title="ภาพรวมตามแผนก / Department Overview" className="mb-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>แผนก / Department</TableHead><TableHead className="text-right">ทั้งหมด / Total</TableHead>
              <TableHead className="text-right">ใช้งาน / In Use</TableHead><TableHead className="text-right">ว่าง / Available</TableHead>
              <TableHead className="text-right">มอบหมาย / Assigned</TableHead><TableHead className="text-right">ซ่อม / Repair</TableHead>
              <TableHead className="text-right">สูญหาย / Lost</TableHead><TableHead className="text-right">ใช้งาน% / Util.</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {deptOverview.map((d) => (
                <TableRow key={d.id ?? "none"}>
                  <TableCell>{d.id ? <Link href={`/assets?departmentId=${d.id}`} className="text-primary hover:underline">{d.name}</Link> : d.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.inUse}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.available}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.assigned}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.repair}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.lost}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{d.utilization}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </ChartCard>

      {/* Duplicate assets */}
      {dups.count > 0 && (
        <ChartCard title={`Serial Number ซ้ำ / Duplicate Serials (${dups.count} กลุ่ม)`} className="mb-4">
          <div className="space-y-3">
            {dups.groups.slice(0, 20).map((g) => (
              <div key={g.serialNumber} className="rounded-md border p-2">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400"><Copy className="h-3 w-3" /> S/N: <span className="font-mono">{g.serialNumber}</span> · {g.items.length} รายการ</p>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((a) => (
                    <Link key={a.id} href={`/assets/${a.id}`} className="rounded border bg-muted/30 px-2 py-1 text-xs hover:bg-muted">
                      <span className="font-mono">{a.assetTag}</span> · {a.name} · {a.department?.name ?? "-"} · {a.status}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            {dups.count > 20 && <p className="text-xs text-muted-foreground">แสดง 20 กลุ่มแรก — ส่งออก Excel เพื่อดูทั้งหมด</p>}
          </div>
        </ChartCard>
      )}

      {/* Section C — Detail with search / filter / sort / pagination */}
      <ChartCard title={`รายละเอียดทรัพย์สิน / Asset Detail (${total.toLocaleString()})`}>
        <div className="mb-3">
          <SearchFilterBar
            action="/reports/assets" q={sp.q} placeholder="ค้นหา แท็ก/ซีเรียล/ชื่อ / Search tag, serial, name..."
            filters={[
              { name: "status", value: sp.status, allLabel: "ทุกสถานะ / All statuses", options: ASSET_STATUSES.map((s) => ({ value: s, label: s })) },
              { name: "categoryId", value: sp.categoryId, allLabel: "ทุกหมวดหมู่ / All categories", options: categories.map((c) => ({ value: c.id, label: c.name })) },
              { name: "departmentId", value: sp.departmentId, allLabel: "ทุกแผนก / All departments", options: departments.map((d) => ({ value: d.id, label: d.name })) },
              { name: "locationId", value: sp.locationId, allLabel: "ทุกสถานที่ / All locations", options: locations.map((l) => ({ value: l.id, label: l.name })) },
              { name: "condition", value: sp.condition, allLabel: "ทุกสภาพ / All conditions", options: ["NEW", "GOOD", "FAIR", "DAMAGED", "CRITICAL"].map((c) => ({ value: c, label: c })) },
            ]}
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <SortHead col="assetTag">แท็ก / Tag</SortHead>
              <SortHead col="name">ชื่อ / Name</SortHead>
              <TableHead>ยี่ห้อ/รุ่น / Brand·Model</TableHead>
              <TableHead>หมวดหมู่ / Category</TableHead>
              <TableHead>แผนก / Dept</TableHead>
              <TableHead>สถานที่ / Location</TableHead>
              <TableHead>ผู้ขาย / Vendor</TableHead>
              <SortHead col="status">สถานะ / Status</SortHead>
              <TableHead>สภาพ / Cond.</TableHead>
              <TableHead>ซื้อ / Purchased</TableHead>
              <SortHead col="purchasePrice" className="text-right">ราคา / Cost</SortHead>
              <TableHead className="text-right">มูลค่า / Value</TableHead>
              <SortHead col="warrantyEnd">ประกัน / Warranty</SortHead>
              <TableHead className="text-right">เหลือ / Days</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={14} className="py-8 text-center text-muted-foreground">ไม่พบข้อมูล / No assets</TableCell></TableRow>}
              {rows.map((a) => {
                const dleft = daysUntil(a.warrantyEnd);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-sm"><Link href={`/assets/${a.id}`} className="text-primary hover:underline">{a.assetTag}</Link></TableCell>
                    <TableCell className="max-w-[180px] truncate" title={a.name}>{a.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{[a.brand, a.model].filter(Boolean).join(" ") || "-"}</TableCell>
                    <TableCell>{a.category?.name ?? "-"}</TableCell>
                    <TableCell>{a.department?.name ?? "-"}</TableCell>
                    <TableCell>{a.location?.name ?? "-"}</TableCell>
                    <TableCell>{a.vendor?.name ?? "-"}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell>{a.condition}</TableCell>
                    <TableCell>{formatDate(a.purchaseDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.purchasePrice != null ? `฿${formatMoney(a.purchasePrice)}` : "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">฿{formatMoney(currentBookValue(a))}</TableCell>
                    <TableCell>{formatDate(a.warrantyEnd)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${dleft != null && dleft < 0 ? "text-destructive" : dleft != null && dleft <= 30 ? "text-amber-600 dark:text-amber-400" : ""}`}>{dleft ?? "-"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <Pagination page={page} pageCount={pageCount} basePath="/reports/assets" searchParams={sp} />
      </ChartCard>
    </div>
  );
}
