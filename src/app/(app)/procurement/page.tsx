import Link from "next/link";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/utils";

const STATUSES = [
  "DRAFT",
  "PENDING_MANAGER",
  "PENDING_IT",
  "PENDING_FINANCE",
  "APPROVED",
  "REJECTED",
  "ORDERED",
  "RECEIVED",
  "REGISTERED",
  "CANCELLED",
] as const;

export default async function ProcurementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("procurement:read")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const q = sp.q?.trim() || undefined;
  const status = STATUSES.find((s) => s === sp.status);
  const { page, skip, take } = parsePage(sp.page);

  const where = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q ? { requestNumber: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [requests, total, pendingCount, approvedThisMonth, totalSpend] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where,
      include: { department: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.purchaseRequest.count({ where }),
    prisma.purchaseRequest.count({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { in: ["PENDING_MANAGER", "PENDING_IT", "PENDING_FINANCE"] },
      },
    }),
    prisma.approval.count({
      where: {
        organizationId: user.organizationId,
        subjectType: "PURCHASE_REQUEST",
        stepName: "FINANCE",
        decision: "APPROVED",
        decidedAt: { gte: monthStart },
      },
    }),
    prisma.purchaseRequest.aggregate({
      where: { organizationId: user.organizationId, deletedAt: null },
      _sum: { totalEstimated: true },
    }),
  ]);

  // requesterId stores a User id (no Prisma relation) — resolve names in one query.
  const requesterIds = [
    ...new Set(requests.map((r) => r.requesterId).filter((v): v is string => !!v)),
  ];
  const requesters = requesterIds.length
    ? await prisma.user.findMany({
        where: { id: { in: requesterIds }, organizationId: user.organizationId },
        select: { id: true, name: true },
      })
    : [];
  const requesterMap = new Map(requesters.map((u) => [u.id, u.name]));

  const canCreate = user.permissions.has("procurement:create");
  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader
        title="จัดซื้อ / Procurement"
        description="คำขอจัดซื้อและการอนุมัติ / Purchase requests and approvals"
      >
        {canCreate && (
          <Button asChild>
            <Link href="/procurement/new">
              <Plus className="h-4 w-4" /> สร้างคำขอ / New Request
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="รออนุมัติ / Pending Approvals"
          value={pendingCount}
          tone={pendingCount > 0 ? "warning" : "default"}
        />
        <StatCard
          label="อนุมัติเดือนนี้ / Approved This Month"
          value={approvedThisMonth}
          tone="success"
        />
        <StatCard
          label="ยอดขอจัดซื้อรวม / Total Spend Requested"
          value={`฿${formatMoney(Number(totalSpend._sum.totalEstimated ?? 0))}`}
        />
      </div>

      <SearchFilterBar
        action="/procurement"
        q={q}
        placeholder="ค้นหาเลขที่คำขอ / Search request #..."
        filters={[
          {
            name: "status",
            value: status,
            allLabel: "ทุกสถานะ / All statuses",
            options: STATUSES.map((s) => ({ value: s, label: s.replaceAll("_", " ") })),
          },
        ]}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่ / Request #</TableHead>
            <TableHead>ผู้ขอ / Requester</TableHead>
            <TableHead>แผนก / Department</TableHead>
            <TableHead>ยอดประมาณ / Total</TableHead>
            <TableHead>สถานะ / Status</TableHead>
            <TableHead>วันที่ / Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                ไม่พบข้อมูล / No purchase requests found
              </TableCell>
            </TableRow>
          )}
          {requests.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <Link href={`/procurement/${r.id}`} className="font-medium text-primary hover:underline">
                  {r.requestNumber}
                </Link>
              </TableCell>
              <TableCell>{r.requesterId ? requesterMap.get(r.requesterId) ?? "-" : "-"}</TableCell>
              <TableCell>{r.department?.name ?? "-"}</TableCell>
              <TableCell className="tabular-nums">{formatMoney(r.totalEstimated)}</TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell>{formatDate(r.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination page={page} pageCount={pageCount} basePath="/procurement" searchParams={sp} />
    </div>
  );
}
