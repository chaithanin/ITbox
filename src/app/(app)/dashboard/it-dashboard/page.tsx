import Link from "next/link";
import {
  Ticket, Timer, ShieldCheck, MonitorSmartphone, KeyRound, Coins,
  Gauge, AlertTriangle, Boxes, Wrench, Clock, TrendingUp, ChevronRight,
} from "lucide-react";
import type { CaseStatus } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Donut, Legend, HBars, Meter, Sparkline, type Segment, type HBarRow } from "./charts";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["NEW", "TRIAGE", "ASSIGNED", "IN_PROGRESS", "WAITING_USER", "WAITING_VENDOR", "REOPENED"] as const;
const DONE_STATUSES = ["RESOLVED", "CLOSED"] as const;
const COUNTABLE = ["NEW", "TRIAGE", "ASSIGNED", "IN_PROGRESS", "WAITING_USER", "WAITING_VENDOR", "REOPENED", "RESOLVED", "CLOSED", "REOPENED"] as const;

const STATUS_LABEL: Record<string, string> = {
  NEW: "New", TRIAGE: "Triage", ASSIGNED: "Assigned", IN_PROGRESS: "In Progress",
  WAITING_USER: "Waiting User", WAITING_VENDOR: "Waiting Vendor",
  RESOLVED: "Resolved", CLOSED: "Closed", REOPENED: "Reopened",
};
const STATUS_COLOR: Record<string, string> = {
  NEW: "#3b82f6", TRIAGE: "#6366f1", ASSIGNED: "#8b5cf6", IN_PROGRESS: "#f59e0b",
  WAITING_USER: "#eab308", WAITING_VENDOR: "#f97316", RESOLVED: "#10b981",
  CLOSED: "#14b8a6", REOPENED: "#ef4444",
};
const PRIORITY_COLOR: Record<string, string> = { P1: "#ef4444", P2: "#f97316", P3: "#3b82f6", P4: "#64748b" };
const ASSET_COLORS = ["#2563eb", "#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#64748b"];
const COST_COLORS = ["#2563eb", "#7c3aed", "#0ea5e9", "#f59e0b", "#10b981", "#64748b"];

function fmtHours(h: number): string {
  if (!isFinite(h) || h <= 0) return "—";
  if (h < 1) return `${Math.round(h * 60)} นาที`;
  return `${h.toFixed(1)} ชม.`;
}
function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function KpiTile({
  icon: Icon, label, value, sub, tone = "text-primary",
}: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string; tone?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${tone}`} />
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <p className="mt-2 text-2xl font-bold leading-none">{value}</p>
        {sub && <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default async function ItDashboardPage() {
  const user = await requirePermission("report:read");
  const orgId = user.organizationId;
  const orgWhere = { organizationId: orgId, deletedAt: null };
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const in30 = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const fourYearsAgo = new Date(now.getTime() - 4 * 365 * 24 * 3600 * 1000);
  const sevenAgo = new Date(now.getTime() - 6 * 24 * 3600 * 1000);
  sevenAgo.setUTCHours(0, 0, 0, 0);

  const [
    caseByStatus, caseByPriorityOpen, caseByCategory, categories,
    totalCountable, breachedCount, openOverdue,
    resolvedRecent, createdRecent,
    assetByStatus, assetByCategory, assetCats, assetTotal,
    assetCostAll, assetCostYtd,
    licenses, licenseAssignedActive,
    inRepair, warrantyExpired, oldAssets,
    failedLogins,
  ] = await Promise.all([
    prisma.supportCase.groupBy({ by: ["status"], where: orgWhere, _count: true }),
    prisma.supportCase.groupBy({ by: ["priority"], where: { ...orgWhere, status: { in: OPEN_STATUSES as unknown as CaseStatus[] } }, _count: true }),
    prisma.supportCase.groupBy({ by: ["categoryId"], where: orgWhere, _count: true }),
    prisma.caseCategory.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true, nameTh: true } }),
    prisma.supportCase.count({ where: { ...orgWhere, status: { in: COUNTABLE as unknown as CaseStatus[] } } }),
    prisma.supportCase.count({ where: { ...orgWhere, status: { in: COUNTABLE as unknown as CaseStatus[] }, resolutionBreached: true } }),
    prisma.supportCase.count({ where: { ...orgWhere, status: { in: OPEN_STATUSES as unknown as CaseStatus[] }, resolutionDueAt: { lt: now } } }),
    prisma.supportCase.findMany({
      where: { ...orgWhere, status: { in: DONE_STATUSES as unknown as CaseStatus[] }, resolvedAt: { not: null } },
      select: { createdAt: true, resolvedAt: true, firstRespondedAt: true },
      orderBy: { resolvedAt: "desc" }, take: 500,
    }),
    prisma.supportCase.findMany({
      where: { ...orgWhere, createdAt: { gte: sevenAgo } },
      select: { createdAt: true },
    }),
    prisma.asset.groupBy({ by: ["status"], where: orgWhere, _count: true }),
    prisma.asset.groupBy({ by: ["categoryId"], where: orgWhere, _count: true }),
    prisma.assetCategory.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true } }),
    prisma.asset.count({ where: orgWhere }),
    prisma.asset.aggregate({ where: orgWhere, _sum: { purchasePrice: true } }),
    prisma.asset.aggregate({ where: { ...orgWhere, purchaseDate: { gte: yearStart } }, _sum: { purchasePrice: true } }),
    prisma.license.findMany({ where: orgWhere, select: { id: true, softwareName: true, totalSeats: true, expiresAt: true, cost: true } }),
    prisma.licenseAssignment.count({ where: { revokedAt: null, license: orgWhere } }),
    prisma.asset.count({ where: { ...orgWhere, status: "IN_REPAIR" } }),
    prisma.asset.count({ where: { ...orgWhere, warrantyEnd: { lt: now }, status: { in: ["IN_USE", "ASSIGNED"] } } }),
    prisma.asset.count({ where: { ...orgWhere, purchaseDate: { lt: fourYearsAgo }, status: { notIn: ["RETIRED", "DISPOSED"] } } }),
    prisma.auditLog.count({ where: { organizationId: orgId, action: "LOGIN_FAILED", createdAt: { gte: yearStart } } }).catch(() => 0),
  ]);

  // ---- Tickets ----
  const statusCount = new Map(caseByStatus.map((g) => [g.status, g._count]));
  const totalTickets = caseByStatus.reduce((s, g) => s + g._count, 0);
  const openTickets = OPEN_STATUSES.reduce((s, st) => s + (statusCount.get(st) ?? 0), 0);
  const ticketSegments: Segment[] = caseByStatus
    .filter((g) => g._count > 0 && g.status in STATUS_LABEL)
    .sort((a, b) => b._count - a._count)
    .map((g) => ({ label: STATUS_LABEL[g.status] ?? g.status, value: g._count, color: STATUS_COLOR[g.status] ?? "#94a3b8" }));

  // 7-day trend
  const trendMap = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenAgo.getTime() + i * 24 * 3600 * 1000);
    trendMap.set(dayKey(d), 0);
  }
  for (const c of createdRecent) {
    const k = dayKey(c.createdAt);
    if (trendMap.has(k)) trendMap.set(k, (trendMap.get(k) ?? 0) + 1);
  }
  const trend = [...trendMap.values()];

  // ---- SLA ----
  const slaCompliance = totalCountable > 0 ? ((totalCountable - breachedCount) / totalCountable) * 100 : 100;
  let sumResolveH = 0, nResolve = 0, sumRespH = 0, nResp = 0;
  for (const c of resolvedRecent) {
    if (c.resolvedAt) { sumResolveH += (c.resolvedAt.getTime() - c.createdAt.getTime()) / 3600000; nResolve++; }
    if (c.firstRespondedAt) { sumRespH += (c.firstRespondedAt.getTime() - c.createdAt.getTime()) / 3600000; nResp++; }
  }
  const avgResolveH = nResolve > 0 ? sumResolveH / nResolve : 0;
  const avgRespH = nResp > 0 ? sumRespH / nResp : 0;

  // SLA compliance by priority (share of open tickets by priority as a proxy view)
  const priBars: HBarRow[] = (["P1", "P2", "P3", "P4"] as const).map((p) => ({
    label: p, value: caseByPriorityOpen.find((g) => g.priority === p)?._count ?? 0, color: PRIORITY_COLOR[p],
  }));

  // ---- Incidents by category ----
  const catName = new Map(categories.map((c) => [c.id, c.nameTh || c.name]));
  const incidentRows: HBarRow[] = caseByCategory
    .filter((g) => g.categoryId && g._count > 0)
    .map((g) => ({ label: catName.get(g.categoryId!) ?? "—", value: g._count, color: "#3b82f6" }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const uncategorized = caseByCategory.find((g) => !g.categoryId)?._count ?? 0;
  if (uncategorized > 0) incidentRows.push({ label: "อื่นๆ / Other", value: uncategorized, color: "#94a3b8" });
  const topIssue = incidentRows[0];

  // ---- Assets ----
  const assetStatusCount = new Map(assetByStatus.map((g) => [g.status, g._count]));
  const inUse = (assetStatusCount.get("IN_USE") ?? 0) + (assetStatusCount.get("ASSIGNED") ?? 0);
  const available = assetStatusCount.get("AVAILABLE") ?? 0;
  const retired = (assetStatusCount.get("RETIRED") ?? 0) + (assetStatusCount.get("DISPOSED") ?? 0);
  const assetCatName = new Map(assetCats.map((c) => [c.id, c.name]));
  const assetSegments: Segment[] = assetByCategory
    .filter((g) => g._count > 0)
    .sort((a, b) => b._count - a._count)
    .slice(0, 7)
    .map((g, i) => ({ label: g.categoryId ? assetCatName.get(g.categoryId) ?? "—" : "ไม่ระบุ", value: g._count, color: ASSET_COLORS[i % ASSET_COLORS.length] }));

  // ---- Licenses ----
  const totalSeats = licenses.reduce((s, l) => s + l.totalSeats, 0);
  const licenseAvail = Math.max(0, totalSeats - licenseAssignedActive);
  const licenseUtil = totalSeats > 0 ? (licenseAssignedActive / totalSeats) * 100 : 0;
  const expiringSoon = licenses.filter((l) => l.expiresAt && l.expiresAt >= now && l.expiresAt <= in30).length;
  const topLicenses: HBarRow[] = [...licenses]
    .sort((a, b) => b.totalSeats - a.totalSeats)
    .slice(0, 4)
    .map((l) => ({ label: l.softwareName, value: l.totalSeats, color: "#7c3aed", suffix: `${l.totalSeats} ที่นั่ง` }));

  // ---- Cost ----
  const totalAssetCost = Number(assetCostAll._sum.purchasePrice ?? 0);
  const ytdAssetCost = Number(assetCostYtd._sum.purchasePrice ?? 0);
  const licenseCost = licenses.reduce((s, l) => s + Number(l.cost ?? 0), 0);
  const totalItCost = totalAssetCost + licenseCost;
  const costSegments: Segment[] = [
    { label: "ทรัพย์สิน / Hardware", value: totalAssetCost, color: COST_COLORS[0] },
    { label: "ไลเซนส์ / Licenses", value: licenseCost, color: COST_COLORS[1] },
  ].filter((s) => s.value > 0);

  // ---- Alerts (each deep-links to the exact filtered list) ----
  const alerts: { icon: React.ComponentType<{ className?: string }>; text: string; value: string; tone: string; href?: string }[] = [];
  if (openOverdue > 0) alerts.push({ icon: AlertTriangle, text: "เคสเกิน SLA (ค้างและเลยกำหนด) / Overdue tickets", value: `${openOverdue}`, tone: "text-red-600", href: "/support/queue?overdue=1" });
  if (expiringSoon > 0) alerts.push({ icon: KeyRound, text: "ไลเซนส์ใกล้หมดอายุใน 30 วัน / Licenses expiring", value: `${expiringSoon}`, tone: "text-amber-600", href: "/licenses?expiring=soon" });
  if (inRepair > 0) alerts.push({ icon: Wrench, text: "อุปกรณ์อยู่ระหว่างซ่อม / Assets in repair", value: `${inRepair}`, tone: "text-amber-600", href: "/assets?status=IN_REPAIR" });
  if (warrantyExpired > 0) alerts.push({ icon: ShieldCheck, text: "อุปกรณ์ใช้งานที่หมดประกันแล้ว / In-use out of warranty", value: `${warrantyExpired}`, tone: "text-orange-600", href: "/assets?warranty=expired" });
  if (oldAssets > 0) alerts.push({ icon: MonitorSmartphone, text: "อุปกรณ์อายุเกิน 4 ปี ควรพิจารณาเปลี่ยน / Assets over 4 years", value: `${oldAssets}`, tone: "text-orange-600", href: "/assets?age=old" });
  if (slaCompliance < 95) alerts.push({ icon: Gauge, text: "SLA Compliance ต่ำกว่าเป้าหมาย 95% / Below target", value: `${slaCompliance.toFixed(1)}%`, tone: "text-red-600", href: "/support/metrics" });
  if (alerts.length === 0) alerts.push({ icon: ShieldCheck, text: "ไม่มีรายการที่ต้องดำเนินการเร่งด่วน / Nothing critical", value: "✓", tone: "text-emerald-600" });

  return (
    <div className="space-y-5">
      <PageHeader
        title="IT Dashboard / แดชบอร์ดผู้บริหาร แผนก IT"
        description="มองเห็นทุกปัญหา ควบคุมระบบ บริหารต้นทุน IT อย่างมีประสิทธิภาพ — ข้อมูลจริงจากระบบทั้งหมด"
      />

      {/* KPI SUMMARY */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiTile icon={Ticket} label="Open Tickets" value={openTickets.toLocaleString()} sub={`จากทั้งหมด ${totalTickets.toLocaleString()} เคส`} tone="text-blue-600" />
        <KpiTile icon={ShieldCheck} label="SLA Compliance" value={`${slaCompliance.toFixed(1)}%`} sub={`เกิน SLA ${breachedCount} เคส`} tone="text-emerald-600" />
        <KpiTile icon={Timer} label="Avg Resolution" value={fmtHours(avgResolveH)} sub={`ตอบกลับเฉลี่ย ${fmtHours(avgRespH)}`} tone="text-violet-600" />
        <KpiTile icon={MonitorSmartphone} label="IT Assets" value={assetTotal.toLocaleString()} sub={`ใช้งาน ${inUse.toLocaleString()} · ว่าง ${available.toLocaleString()}`} tone="text-sky-600" />
        <KpiTile icon={KeyRound} label="License Utilization" value={`${licenseUtil.toFixed(1)}%`} sub={`${licenseAssignedActive}/${totalSeats} ที่นั่ง`} tone="text-amber-600" />
        <KpiTile icon={Coins} label="IT Cost (YTD)" value={`฿${fmtMoney(ytdAssetCost)}`} sub={`มูลค่ารวม ฿${fmtMoney(totalItCost)}`} tone="text-rose-600" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* TICKET ANALYSIS */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Ticket className="h-4 w-4 text-blue-600" /> Helpdesk & Ticket Analysis</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[auto,1fr] items-center gap-4">
              <Donut segments={ticketSegments} centerTop={totalTickets.toLocaleString()} centerSub="Total" size={140} />
              <Legend segments={ticketSegments} total={totalTickets} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Ticket Trend (7 วันล่าสุด)</p>
              <Sparkline points={trend} />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                {[...trendMap.keys()].map((k) => <span key={k}>{k.slice(5)}</span>)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SLA PERFORMANCE */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Gauge className="h-4 w-4 text-emerald-600" /> SLA Performance</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-emerald-600">{slaCompliance.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">SLA Compliance</p>
              <div className="mx-auto mt-3 max-w-xs"><Meter percent={slaCompliance} color={slaCompliance >= 95 ? "#16a34a" : slaCompliance >= 90 ? "#f59e0b" : "#dc2626"} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-md border p-2">
                <p className="text-lg font-bold">{fmtHours(avgRespH)}</p>
                <p className="text-[11px] text-muted-foreground">ตอบกลับเฉลี่ย / Response</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-lg font-bold">{fmtHours(avgResolveH)}</p>
                <p className="text-[11px] text-muted-foreground">แก้ไขเฉลี่ย / Resolution</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">เคสค้างตามความเร่งด่วน / Open by Priority</p>
              <HBars rows={priBars} />
            </div>
          </CardContent>
        </Card>

        {/* INCIDENT ANALYSIS */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-orange-600" /> Incident Analysis</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {incidentRows.length > 0 ? <HBars rows={incidentRows} /> : <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลเคส / No case data</p>}
            {topIssue && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-[11px] text-muted-foreground">ปัญหาที่พบมากสุด / Top issue</p>
                <p className="mt-0.5 flex items-center gap-2 font-semibold"><TrendingUp className="h-4 w-4 text-orange-600" /> {topIssue.label} ({topIssue.value})</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ASSET MANAGEMENT */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Boxes className="h-4 w-4 text-sky-600" /> IT Asset Management</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div><p className="text-lg font-bold text-sky-600">{assetTotal}</p><p className="text-muted-foreground">ทั้งหมด</p></div>
              <div><p className="text-lg font-bold text-blue-600">{inUse}</p><p className="text-muted-foreground">ใช้งาน</p></div>
              <div><p className="text-lg font-bold text-emerald-600">{available}</p><p className="text-muted-foreground">ว่าง</p></div>
              <div><p className="text-lg font-bold text-amber-600">{inRepair}</p><p className="text-muted-foreground">ซ่อม</p></div>
            </div>
            <div className="grid grid-cols-[auto,1fr] items-center gap-4">
              <Donut segments={assetSegments} centerTop={assetTotal.toLocaleString()} centerSub="Assets" size={130} />
              <Legend segments={assetSegments} total={assetTotal} />
            </div>
            <p className="text-[11px] text-muted-foreground">เกษียณแล้ว / Retired: {retired}</p>
          </CardContent>
        </Card>

        {/* LICENSE MANAGEMENT */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><KeyRound className="h-4 w-4 text-violet-600" /> Software & License</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div><p className="text-lg font-bold">{totalSeats.toLocaleString()}</p><p className="text-muted-foreground">ทั้งหมด</p></div>
              <div><p className="text-lg font-bold text-violet-600">{licenseAssignedActive.toLocaleString()}</p><p className="text-muted-foreground">ใช้แล้ว</p></div>
              <div><p className="text-lg font-bold text-emerald-600">{licenseAvail.toLocaleString()}</p><p className="text-muted-foreground">คงเหลือ</p></div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs"><span className="text-muted-foreground">License Utilization</span><span className="font-bold">{licenseUtil.toFixed(1)}%</span></div>
              <Meter percent={licenseUtil} color="#7c3aed" />
            </div>
            {topLicenses.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Top Licenses</p>
                <HBars rows={topLicenses} />
              </div>
            )}
            {expiringSoon > 0 && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                ⚠ {expiringSoon} ไลเซนส์ใกล้หมดอายุใน 30 วัน
              </p>
            )}
          </CardContent>
        </Card>

        {/* COST */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Coins className="h-4 w-4 text-rose-600" /> IT Cost & Value</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-md border p-2"><p className="text-lg font-bold">฿{fmtMoney(ytdAssetCost)}</p><p className="text-[11px] text-muted-foreground">จัดซื้อปีนี้ / YTD</p></div>
              <div className="rounded-md border p-2"><p className="text-lg font-bold">฿{fmtMoney(totalItCost)}</p><p className="text-[11px] text-muted-foreground">มูลค่ารวม / Total value</p></div>
            </div>
            {costSegments.length > 0 ? (
              <div className="grid grid-cols-[auto,1fr] items-center gap-4">
                <Donut segments={costSegments} centerTop={`฿${fmtMoney(totalItCost)}`} size={130} />
                <Legend segments={costSegments} total={totalItCost} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ยังไม่มีข้อมูลราคา (กรอกราคาซื้อในทรัพย์สิน/ไลเซนส์)</p>
            )}
            <p className="text-[11px] text-muted-foreground">* คำนวณจากราคาซื้อทรัพย์สิน + ค่าไลเซนส์ในระบบ</p>
          </CardContent>
        </Card>
      </div>

      {/* ALERTS & ACTIONS */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-red-600" /> IT Alerts & Actions / รายการที่ต้องดำเนินการ</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {alerts.map((a, i) => {
              const inner = (
                <>
                  <a.icon className={`h-5 w-5 shrink-0 ${a.tone}`} />
                  <span className="flex-1 text-sm">{a.text}</span>
                  <span className={`text-lg font-bold tabular-nums ${a.tone}`}>{a.value}</span>
                  {a.href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                </>
              );
              return a.href ? (
                <Link
                  key={i}
                  href={a.href}
                  className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent"
                >
                  {inner}
                </Link>
              ) : (
                <div key={i} className="flex items-center gap-3 rounded-md border p-3">{inner}</div>
              );
            })}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> อัปเดตล่าสุด {now.toLocaleString("th-TH")} · ข้อมูลจริงจากระบบ TECHCORE
            {failedLogins > 0 && ` · Login ล้มเหลวปีนี้ ${failedLogins} ครั้ง`}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
