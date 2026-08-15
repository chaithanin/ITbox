import Link from "next/link";
import { ArrowLeft, Filter } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { BarChartCard, type BarRow } from "../bar-chart";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  AVAILABLE: "bg-emerald-500",
  IN_USE: "bg-blue-500",
  ASSIGNED: "bg-blue-500",
  IN_REPAIR: "bg-amber-500",
  LOST: "bg-red-500",
  STOLEN: "bg-red-500",
  DAMAGED: "bg-red-500",
  RETIRED: "bg-slate-400",
  DISPOSED: "bg-slate-400",
};

function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : undefined;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requirePermission("report:read");
  const sp = await searchParams;
  const departmentId = str(sp.departmentId);
  const locationId = str(sp.locationId);
  const categoryId = str(sp.categoryId);

  const now = new Date();
  const in30d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const orgId = user.organizationId;
  const assetWhere = {
    organizationId: orgId,
    deletedAt: null,
    ...(departmentId ? { departmentId } : {}),
    ...(locationId ? { locationId } : {}),
    ...(categoryId ? { categoryId } : {}),
  };

  const [
    statusGroups,
    categoryGroups,
    departmentGroups,
    activeEmployees,
    vaultCount,
    rotationDue,
    licensesExpiring,
    subsRenewing,
    warrantyExpiring,
    maintenanceOpen,
    pendingApprovals,
    vaultCategoryGroups,
    historyRows,
    recentAudit,
    failedLogins24h,
    lockedUsers,
    pendingEmergency,
    departments,
    locations,
    categories,
    supportOpen,
    supportSlaBreached,
  ] = await Promise.all([
    prisma.asset.groupBy({ by: ["status"], _count: true, where: assetWhere }),
    prisma.asset.groupBy({ by: ["categoryId"], _count: true, where: assetWhere }),
    prisma.asset.groupBy({ by: ["departmentId"], _count: true, where: assetWhere }),
    prisma.employee.count({
      where: { organizationId: orgId, deletedAt: null, status: "ACTIVE" },
    }),
    prisma.vaultItem.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.vaultItem.count({
      where: { organizationId: orgId, deletedAt: null, nextRotationAt: { lte: now } },
    }),
    prisma.license.count({
      where: { organizationId: orgId, deletedAt: null, expiresAt: { gte: now, lte: in30d } },
    }),
    prisma.subscription.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
        status: "ACTIVE",
        renewalDate: { gte: now, lte: in30d },
      },
    }),
    prisma.asset.count({
      where: { ...assetWhere, warrantyEnd: { gte: now, lte: in30d } },
    }),
    prisma.maintenanceTicket.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
        status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PART", "WAITING_VENDOR"] },
      },
    }),
    prisma.approval.count({ where: { organizationId: orgId, decision: "PENDING" } }),
    prisma.vaultItem.groupBy({
      by: ["categoryId"],
      _count: true,
      where: { organizationId: orgId, deletedAt: null },
    }),
    prisma.assetHistory.findMany({
      where: { organizationId: orgId, createdAt: { gte: sixMonthsStart } },
      select: { createdAt: true, action: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    }),
    prisma.auditLog.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { user: { select: { name: true } } },
    }),
    prisma.auditLog.count({
      where: {
        organizationId: orgId,
        action: "LOGIN",
        result: { in: ["FAILED", "DENIED"] },
        createdAt: { gte: ago24h },
      },
    }),
    prisma.user.count({
      where: { organizationId: orgId, deletedAt: null, lockedUntil: { gt: now } },
    }),
    prisma.vaultEmergencyRequest.count({
      where: { organizationId: orgId, status: "PENDING" },
    }),
    prisma.department.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.assetCategory.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.supportCase.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
        status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED", "DUPLICATE"] },
      },
    }),
    prisma.supportCase.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
        resolutionBreached: true,
        status: { notIn: ["RESOLVED", "CLOSED", "CANCELLED", "DUPLICATE"] },
      },
    }),
  ]);

  // Resolve vault category names (metadata only — never secret fields)
  const vaultCatIds = vaultCategoryGroups
    .map((g) => g.categoryId)
    .filter((id): id is string => id !== null);
  const vaultCategories = vaultCatIds.length
    ? await prisma.vaultCategory.findMany({
        where: { id: { in: vaultCatIds } },
        select: { id: true, name: true },
      })
    : [];

  const statusCount = (statuses: string[]) =>
    statusGroups
      .filter((g) => statuses.includes(g.status))
      .reduce((sum, g) => sum + g._count, 0);
  const totalAssets = statusGroups.reduce((sum, g) => sum + g._count, 0);

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const departmentName = new Map(departments.map((d) => [d.id, d.name]));
  const vaultCategoryName = new Map(vaultCategories.map((c) => [c.id, c.name]));
  const UNSPECIFIED = "ไม่ระบุ / Unspecified";

  const byCategory: BarRow[] = categoryGroups
    .map((g) => ({
      label: g.categoryId ? categoryName.get(g.categoryId) ?? UNSPECIFIED : UNSPECIFIED,
      count: g._count,
    }))
    .sort((a, b) => b.count - a.count);

  const byDepartment: BarRow[] = departmentGroups
    .map((g) => ({
      label: g.departmentId ? departmentName.get(g.departmentId) ?? UNSPECIFIED : UNSPECIFIED,
      count: g._count,
    }))
    .sort((a, b) => b.count - a.count);

  const byStatus: BarRow[] = statusGroups
    .map((g) => ({
      label: g.status.replaceAll("_", " "),
      count: g._count,
      color: STATUS_COLOR[g.status] ?? "bg-primary",
    }))
    .sort((a, b) => b.count - a.count);

  const vaultByCategory: BarRow[] = vaultCategoryGroups
    .map((g) => ({
      label: g.categoryId ? vaultCategoryName.get(g.categoryId) ?? UNSPECIFIED : UNSPECIFIED,
      count: g._count,
    }))
    .sort((a, b) => b.count - a.count);

  // Monthly asset movement — group AssetHistory rows by month in JS
  const monthBuckets: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("th-TH", { month: "short", year: "2-digit" }),
    });
  }
  const monthCounts = new Map<string, number>(monthBuckets.map((m) => [m.key, 0]));
  for (const h of historyRows) {
    const key = `${h.createdAt.getFullYear()}-${String(h.createdAt.getMonth() + 1).padStart(2, "0")}`;
    if (monthCounts.has(key)) monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
  }
  const monthlyMovement: BarRow[] = monthBuckets.map((m) => ({
    label: m.label,
    count: monthCounts.get(m.key) ?? 0,
  }));

  return (
    <div>
      <Link
        href="/dashboard"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        เลือกโมดูล / All modules
      </Link>
      <PageHeader
        title="ภาพรวมระบบ / Overview"
        description="ภาพรวมระบบบริหารจัดการไอที / Enterprise IT overview"
      />

      {/* Asset filters */}
      <form action="/dashboard/overview" method="get" className="mb-4 flex flex-wrap items-center gap-2">
        <Select name="departmentId" defaultValue={departmentId ?? ""} className="w-auto min-w-[10rem]">
          <option value="">ทุกแผนก / All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select name="locationId" defaultValue={locationId ?? ""} className="w-auto min-w-[10rem]">
          <option value="">ทุกสถานที่ / All locations</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Select name="categoryId" defaultValue={categoryId ?? ""} className="w-auto min-w-[10rem]">
          <option value="">ทุกหมวดหมู่ / All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          <Filter className="h-4 w-4" />
          กรอง / Filter
        </Button>
      </form>

      {/* Asset stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="ทรัพย์สินทั้งหมด / Total Assets" value={totalAssets} href="/assets" />
        <StatCard
          label="ใช้งานอยู่ / In Use"
          value={statusCount(["IN_USE", "ASSIGNED"])}
          href="/assets?status=IN_USE"
        />
        <StatCard
          label="ว่าง / Available"
          value={statusCount(["AVAILABLE"])}
          tone="success"
          href="/assets?status=AVAILABLE"
        />
        <StatCard
          label="ซ่อมบำรุง / Under Repair"
          value={statusCount(["IN_REPAIR"])}
          tone="warning"
          href="/assets?status=IN_REPAIR"
        />
        <StatCard
          label="สูญหาย/ถูกขโมย / Lost-Stolen"
          value={statusCount(["LOST", "STOLEN"])}
          tone="danger"
          href="/assets?status=LOST"
        />
        <StatCard
          label="ปลดระวาง / Retired"
          value={statusCount(["RETIRED", "DISPOSED"])}
          href="/assets?status=RETIRED"
        />
      </div>

      {/* Operational stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="พนักงาน / Employees" value={activeEmployees} href="/employees" />
        <StatCard label="รายการ Vault / Vault Records" value={vaultCount} href="/vault" />
        <StatCard
          label="ครบรอบหมุนเวียน / Rotation Due"
          value={rotationDue}
          tone={rotationDue > 0 ? "warning" : "default"}
          href="/vault/rotation"
        />
        <StatCard
          label="ไลเซนส์ใกล้หมดอายุ / Licenses ≤30d"
          value={licensesExpiring}
          tone={licensesExpiring > 0 ? "warning" : "default"}
          href="/licenses"
        />
        <StatCard
          label="ต่ออายุสมาชิก / Renewals ≤30d"
          value={subsRenewing}
          tone={subsRenewing > 0 ? "warning" : "default"}
          href="/subscriptions"
        />
        <StatCard
          label="ประกันใกล้หมด / Warranty ≤30d"
          value={warrantyExpiring}
          tone={warrantyExpiring > 0 ? "warning" : "default"}
          href="/assets"
        />
        <StatCard
          label="งานซ่อมค้าง / Maintenance Open"
          value={maintenanceOpen}
          tone={maintenanceOpen > 0 ? "warning" : "default"}
          href="/maintenance"
        />
        <StatCard
          label="รออนุมัติ / Pending Approvals"
          value={pendingApprovals}
          tone={pendingApprovals > 0 ? "warning" : "default"}
          href="/procurement"
        />
        <StatCard
          label="เคส IT ค้าง / IT Cases Open"
          value={supportOpen}
          tone={supportOpen > 0 ? "warning" : "default"}
          href="/support/queue"
        />
        <StatCard
          label="เคสเกิน SLA / SLA Breached"
          value={supportSlaBreached}
          tone={supportSlaBreached > 0 ? "danger" : "default"}
          href="/support/queue"
        />
      </div>

      {/* Charts */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <BarChartCard title="ทรัพย์สินตามหมวดหมู่ / Assets by Category" rows={byCategory} />
        <BarChartCard title="ทรัพย์สินตามแผนก / Assets by Department" rows={byDepartment} />
        <BarChartCard title="ทรัพย์สินตามสถานะ / Assets by Status" rows={byStatus} />
        <BarChartCard title="Vault ตามหมวดหมู่ / Vault by Category" rows={vaultByCategory} />
        <BarChartCard
          title="ความเคลื่อนไหวทรัพย์สินรายเดือน / Monthly Asset Movement"
          description={`6 เดือนล่าสุด / Last 6 months: ${historyRows.length.toLocaleString()} รายการ`}
          rows={monthlyMovement}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Recent activities */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">กิจกรรมล่าสุด / Recent Activities</CardTitle>
            <CardDescription>10 รายการล่าสุดจากบันทึกตรวจสอบ / Latest audit entries</CardDescription>
          </CardHeader>
          <CardContent>
            {recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่มีข้อมูล / No data</p>
            ) : (
              <ul className="space-y-2">
                {recentAudit.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{a.user?.name ?? "ระบบ / System"}</span>{" "}
                      <span className="text-muted-foreground">
                        {a.action}
                        {a.entityType ? ` · ${a.entityType}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(a.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3 text-right">
              <Link href="/audit-logs" className="text-xs text-primary hover:underline">
                ดูทั้งหมด / View all →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Security alerts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">การแจ้งเตือนความปลอดภัย / Security Alerts</CardTitle>
            <CardDescription>สรุปเหตุการณ์ด้านความปลอดภัย / Security event summary</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-3">
                <Link href="/security" className="hover:underline">
                  เข้าสู่ระบบล้มเหลว 24 ชม. / Failed logins (24h)
                </Link>
                <span
                  className={
                    failedLogins24h > 0
                      ? "font-bold tabular-nums text-destructive"
                      : "font-bold tabular-nums"
                  }
                >
                  {failedLogins24h}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <Link href="/security" className="hover:underline">
                  บัญชีถูกล็อก / Locked accounts
                </Link>
                <span
                  className={
                    lockedUsers > 0
                      ? "font-bold tabular-nums text-destructive"
                      : "font-bold tabular-nums"
                  }
                >
                  {lockedUsers}
                </span>
              </li>
              <li className="flex items-center justify-between gap-3">
                <Link href="/vault/emergency" className="hover:underline">
                  คำขอเข้าถึงฉุกเฉินรอดำเนินการ / Pending emergency requests
                </Link>
                <span
                  className={
                    pendingEmergency > 0
                      ? "font-bold tabular-nums text-amber-600 dark:text-amber-400"
                      : "font-bold tabular-nums"
                  }
                >
                  {pendingEmergency}
                </span>
              </li>
            </ul>
            <div className="mt-3 text-right">
              <Link href="/security" className="text-xs text-primary hover:underline">
                ศูนย์ความปลอดภัย / Security Center →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
