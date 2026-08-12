import Link from "next/link";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatDate, formatMoney, daysUntil } from "@/lib/utils";

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("subscription:read")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const q = sp.q?.trim() || undefined;
  const status = sp.status?.trim() || undefined;
  const { page, skip, take } = parsePage(sp.page);

  const where = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { serviceName: { contains: q, mode: "insensitive" as const } },
            { plan: { contains: q, mode: "insensitive" as const } },
            { vendor: { is: { name: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
    ...(status === "ACTIVE" || status === "CANCELLED" || status === "EXPIRED"
      ? { status: status as "ACTIVE" | "CANCELLED" | "EXPIRED" }
      : {}),
  };

  const now = new Date();
  const in30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [subs, total, activeCount, activeSubs, renewingSoon] = await Promise.all([
    prisma.subscription.findMany({
      where,
      include: { vendor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.subscription.count({ where }),
    prisma.subscription.count({
      where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
    }),
    prisma.subscription.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
      select: { cost: true, billingCycle: true },
    }),
    prisma.subscription.count({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: "ACTIVE",
        renewalDate: { gte: now, lte: in30d },
      },
    }),
  ]);

  const annualized = activeSubs.reduce((sum, s) => {
    const cost = s.cost === null ? 0 : Number(s.cost);
    if (s.billingCycle === "MONTHLY") return sum + cost * 12;
    return sum + cost; // YEARLY or unspecified
  }, 0);

  const canManage = user.permissions.has("subscription:manage");
  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader
        title="บริการรายเดือน-รายปี / Subscriptions"
        description="จัดการบริการแบบสมัครสมาชิก / Manage recurring service subscriptions"
      >
        {canManage && (
          <Button asChild>
            <Link href="/subscriptions/new">
              <Plus className="h-4 w-4" /> เพิ่มบริการ / New Subscription
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="ใช้งานอยู่ / Active" value={activeCount} tone="success" />
        <StatCard
          label="ค่าใช้จ่ายต่อปี / Annualized Cost"
          value={`฿${formatMoney(annualized)}`}
        />
        <StatCard
          label="ต่ออายุใน 30 วัน / Renewing in 30 days"
          value={renewingSoon}
          tone={renewingSoon > 0 ? "warning" : "default"}
        />
      </div>

      <SearchFilterBar
        action="/subscriptions"
        q={q}
        placeholder="ค้นหาบริการ / Search services..."
        filters={[
          {
            name: "status",
            value: status,
            allLabel: "ทุกสถานะ / All statuses",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "CANCELLED", label: "Cancelled" },
              { value: "EXPIRED", label: "Expired" },
            ],
          },
        ]}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>บริการ / Service</TableHead>
            <TableHead>ผู้ให้บริการ / Vendor</TableHead>
            <TableHead>แผน / Plan</TableHead>
            <TableHead>จำนวน / Qty</TableHead>
            <TableHead>ค่าบริการ / Cost</TableHead>
            <TableHead>รอบบิล / Cycle</TableHead>
            <TableHead>ต่ออายุ / Renewal</TableHead>
            <TableHead>สถานะ / Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subs.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                ไม่พบข้อมูล / No subscriptions found
              </TableCell>
            </TableRow>
          )}
          {subs.map((s) => {
            const days = daysUntil(s.renewalDate);
            return (
              <TableRow key={s.id}>
                <TableCell>
                  {canManage ? (
                    <Link
                      href={`/subscriptions/${s.id}/edit`}
                      className="font-medium text-primary hover:underline"
                    >
                      {s.serviceName}
                    </Link>
                  ) : (
                    <span className="font-medium">{s.serviceName}</span>
                  )}
                </TableCell>
                <TableCell>{s.vendor?.name ?? "-"}</TableCell>
                <TableCell>{s.plan ?? "-"}</TableCell>
                <TableCell className="tabular-nums">{s.quantity}</TableCell>
                <TableCell className="tabular-nums">{formatMoney(s.cost)}</TableCell>
                <TableCell>{s.billingCycle ?? "-"}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {formatDate(s.renewalDate)}
                    {s.status === "ACTIVE" && days !== null && days < 0 && (
                      <Badge variant="destructive">เกินกำหนด / Overdue</Badge>
                    )}
                    {s.status === "ACTIVE" && days !== null && days >= 0 && days < 30 && (
                      <Badge variant="warning">{days} วัน / days</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={s.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Pagination page={page} pageCount={pageCount} basePath="/subscriptions" searchParams={sp} />
    </div>
  );
}
