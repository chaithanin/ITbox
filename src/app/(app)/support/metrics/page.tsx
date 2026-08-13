import Link from "next/link";
import type { CaseStatus, CasePriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PRIORITY_LABEL } from "@/lib/services/support";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const NOT_RESOLVED: CaseStatus[] = [
  "NEW",
  "TRIAGE",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_USER",
  "WAITING_VENDOR",
  "REOPENED",
];

const STATUS_LABEL: Record<CaseStatus, string> = {
  NEW: "ใหม่",
  TRIAGE: "คัดแยก",
  ASSIGNED: "มอบหมายแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  WAITING_USER: "รอผู้ใช้",
  WAITING_VENDOR: "รอผู้ขาย",
  REOPENED: "เปิดใหม่",
  RESOLVED: "แก้ไขแล้ว",
  CLOSED: "ปิดแล้ว",
  CANCELLED: "ยกเลิก",
  DUPLICATE: "ซ้ำ",
};

type BarRow = { label: string; count: number };

function BarList({ rows }: { rows: BarRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">ไม่มีข้อมูล / No data</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="w-32 shrink-0 truncate text-muted-foreground" title={r.label}>
            {r.label}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((r.count / max) * 100)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right tabular-nums">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

export default async function SupportMetricsPage() {
  const user = await requireUser();
  if (!user.permissions.has("support:read")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้ารายงาน IT / You do not have access to IT metrics.
      </p>
    );
  }

  const orgScope = { organizationId: user.organizationId, deletedAt: null };
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    total,
    open,
    resolvedThisMonth,
    closedThisMonth,
    csat,
    resolvedClosedTotal,
    resolvedClosedCompliant,
    reopened,
    firstResponseBreaches,
    byPriority,
    byStatus,
    byCategory,
    byType,
    breaching,
  ] = await Promise.all([
    prisma.supportCase.count({ where: orgScope }),
    prisma.supportCase.count({ where: { ...orgScope, status: { in: NOT_RESOLVED } } }),
    prisma.supportCase.count({ where: { ...orgScope, resolvedAt: { gte: monthStart } } }),
    prisma.supportCase.count({ where: { ...orgScope, closedAt: { gte: monthStart } } }),
    prisma.caseSatisfaction.aggregate({
      _avg: { rating: true },
      where: { case: { organizationId: user.organizationId, deletedAt: null } },
    }),
    prisma.supportCase.count({ where: { ...orgScope, status: { in: ["RESOLVED", "CLOSED"] } } }),
    prisma.supportCase.count({
      where: { ...orgScope, status: { in: ["RESOLVED", "CLOSED"] }, resolutionBreached: false },
    }),
    prisma.supportCase.count({ where: { ...orgScope, reopenCount: { gt: 0 } } }),
    prisma.supportCase.count({ where: { ...orgScope, firstResponseBreached: true } }),
    prisma.supportCase.groupBy({ by: ["priority"], where: orgScope, _count: { _all: true } }),
    prisma.supportCase.groupBy({ by: ["status"], where: orgScope, _count: { _all: true } }),
    prisma.supportCase.groupBy({
      by: ["categoryId"],
      where: orgScope,
      _count: { _all: true },
      orderBy: { _count: { categoryId: "desc" } },
      take: 10,
    }),
    prisma.supportCase.groupBy({ by: ["typeId"], where: orgScope, _count: { _all: true } }),
    prisma.supportCase.findMany({
      where: { ...orgScope, resolutionBreached: true, status: { in: NOT_RESOLVED } },
      orderBy: [{ priority: "asc" }, { resolutionDueAt: "asc" }],
      take: 10,
      select: {
        id: true,
        caseNumber: true,
        subject: true,
        priority: true,
        assignedUser: { select: { name: true } },
      },
    }),
  ]);

  // Resolve category & type names for the grouped charts.
  const categoryIds = byCategory.map((r) => r.categoryId).filter((v): v is string => !!v);
  const typeIds = byType.map((r) => r.typeId).filter((v): v is string => !!v);
  const [categories, types] = await Promise.all([
    categoryIds.length
      ? prisma.caseCategory.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true, nameTh: true },
        })
      : Promise.resolve([]),
    typeIds.length
      ? prisma.caseType.findMany({
          where: { id: { in: typeIds } },
          select: { id: true, name: true, nameTh: true },
        })
      : Promise.resolve([]),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.nameTh || c.name]));
  const typeName = new Map(types.map((t) => [t.id, t.nameTh || t.name]));

  const priorityOrder: CasePriority[] = ["P1", "P2", "P3", "P4"];
  const priorityRows: BarRow[] = priorityOrder.map((p) => ({
    label: `${p} · ${PRIORITY_LABEL[p].th}`,
    count: byPriority.find((r) => r.priority === p)?._count._all ?? 0,
  }));

  const statusRows: BarRow[] = byStatus
    .map((r) => ({ label: STATUS_LABEL[r.status], count: r._count._all }))
    .sort((a, b) => b.count - a.count);

  const categoryRows: BarRow[] = byCategory.map((r) => ({
    label: r.categoryId ? catName.get(r.categoryId) ?? "—" : "ไม่ระบุหมวด",
    count: r._count._all,
  }));

  const typeRows: BarRow[] = byType
    .map((r) => ({
      label: r.typeId ? typeName.get(r.typeId) ?? "—" : "ไม่ระบุประเภท",
      count: r._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  const avgCsat = csat._avg.rating;
  const compliancePct =
    resolvedClosedTotal > 0
      ? Math.round((resolvedClosedCompliant / resolvedClosedTotal) * 100)
      : null;
  const reopenPct = total > 0 ? Math.round((reopened / total) * 100) : null;

  return (
    <div>
      <PageHeader
        title="รายงาน IT Support / IT Metrics"
        description="ภาพรวมประสิทธิภาพงานบริการ (เฉพาะองค์กรของคุณ)"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="เคสทั้งหมด" value={total} />
        <StatCard label="เปิดอยู่" value={open} tone="warning" />
        <StatCard label="แก้ไขเดือนนี้" value={resolvedThisMonth} tone="success" />
        <StatCard label="ปิดเดือนนี้" value={closedThisMonth} tone="success" />
        <StatCard
          label="ความพึงพอใจเฉลี่ย (CSAT)"
          value={avgCsat != null ? `${avgCsat.toFixed(2)} / 5` : "-"}
        />
        <StatCard
          label="SLA Compliance"
          value={compliancePct != null ? `${compliancePct}%` : "-"}
          tone={compliancePct != null && compliancePct < 90 ? "warning" : "success"}
        />
        <StatCard
          label="อัตราเปิดเคสซ้ำ"
          value={reopenPct != null ? `${reopenPct}%` : "-"}
          tone={reopenPct != null && reopenPct > 10 ? "warning" : "default"}
        />
        <StatCard label="เกิน SLA First Response" value={firstResponseBreaches} tone="danger" />
      </div>

      <div className="mb-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">เคสตามความสำคัญ / By Priority</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={priorityRows} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">เคสตามสถานะ / By Status</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={statusRows} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">เคสตามหมวดหมู่ / By Category (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={categoryRows} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">เคสตามประเภท / By Type</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={typeRows} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">เคสที่เปิดอยู่และเกิน SLA / Open cases breaching SLA</CardTitle>
        </CardHeader>
        <CardContent>
          {breaching.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีเคสที่เกิน SLA / No breaching cases</p>
          ) : (
            <ul className="divide-y">
              {breaching.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <Link
                      href={`/support/${c.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {c.caseNumber}
                    </Link>
                    <p className="truncate text-sm">{c.subject}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {c.assignedUser?.name ?? "ยังไม่มอบหมาย"}
                    </span>
                    <StatusBadge status={c.priority} label={c.priority} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
