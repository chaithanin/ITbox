import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDate, daysUntil } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deriveDisplayStatus } from "@/lib/borrow/status";

const BORROW_STATUSES = [
  "DRAFT", "PENDING_MANAGER", "PENDING_IT", "PENDING_MANAGEMENT", "APPROVED",
  "REJECTED", "READY_TO_ISSUE", "ISSUED", "PARTIALLY_RETURNED", "RETURNED",
  "CLOSED", "CANCELLED",
] as const;

export default async function BorrowDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("borrow:read")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  const sp = await searchParams;
  const { page, skip, take } = parsePage(sp.page);
  const q = sp.q?.trim() || undefined;
  const status = BORROW_STATUSES.includes(sp.status as (typeof BORROW_STATUSES)[number])
    ? (sp.status as (typeof BORROW_STATUSES)[number])
    : undefined;

  const where: Prisma.BorrowRequestWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { refNo: { contains: q, mode: "insensitive" } },
            { requesterName: { contains: q, mode: "insensitive" } },
            { purpose: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

  const [rows, total, counts, overdueCount, dueSoonCount] = await Promise.all([
    prisma.borrowRequest.findMany({
      where,
      select: {
        id: true, refNo: true, status: true, requesterName: true, purpose: true,
        borrowDate: true, dueDate: true, createdAt: true,
        requester: { select: { firstName: true, lastName: true } },
        department: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.borrowRequest.count({ where }),
    prisma.borrowRequest.groupBy({
      by: ["status"],
      where: { organizationId: user.organizationId, deletedAt: null },
      _count: true,
    }),
    prisma.borrowRequest.count({
      where: { organizationId: user.organizationId, deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] }, dueDate: { lt: now } },
    }),
    prisma.borrowRequest.count({
      where: { organizationId: user.organizationId, deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] }, dueDate: { gte: now, lte: soon } },
    }),
  ]);

  const countBy = (keys: string[]) =>
    counts.filter((c) => keys.includes(c.status)).reduce((s, c) => s + c._count, 0);

  const kpis = [
    { label: "รออนุมัติ / Pending approval", value: countBy(["PENDING_MANAGER", "PENDING_IT", "PENDING_MANAGEMENT"]), href: "/borrow?status=PENDING_MANAGER" },
    { label: "กำลังยืม / On loan", value: countBy(["ISSUED", "PARTIALLY_RETURNED"]), href: "/borrow?status=ISSUED" },
    { label: "ใกล้ครบกำหนด / Due soon", value: dueSoonCount, href: "/borrow?status=ISSUED" },
    { label: "เกินกำหนด / Overdue", value: overdueCount, href: "/borrow?status=ISSUED", danger: true },
  ];

  return (
    <div>
      <PageHeader
        title="ยืม-คืนทรัพย์สิน / Asset Borrowing & Return"
        description="คำขอยืมและการคืนทรัพย์สินไอที / IT asset loan requests and returns"
      >
        {user.permissions.has("borrow:create") && (
          <Button asChild>
            <Link href="/borrow/new">
              <Plus className="mr-1 h-4 w-4" /> ขอยืมใหม่ / New Request
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href}>
            <Card className="transition-colors hover:border-primary/40">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`mt-1 text-2xl font-bold ${k.danger && k.value > 0 ? "text-destructive" : ""}`}>
                  {k.value}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <SearchFilterBar
        action="/borrow"
        q={q}
        placeholder="ค้นหาเลขที่คำขอ / ผู้ขอ / วัตถุประสงค์"
        filters={[
          {
            name: "status",
            value: status,
            options: BORROW_STATUSES.map((s) => ({ value: s, label: s.replaceAll("_", " ") })),
            allLabel: "ทุกสถานะ / All statuses",
          },
        ]}
      />

      <Card className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เลขที่ / Ref No.</TableHead>
              <TableHead>ผู้ขอ / Requester</TableHead>
              <TableHead>แผนก / Department</TableHead>
              <TableHead className="text-center">รายการ / Items</TableHead>
              <TableHead>กำหนดคืน / Due</TableHead>
              <TableHead>สถานะ / Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  ยังไม่มีคำขอยืม / No borrow requests yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const display = deriveDisplayStatus(r.status, r.dueDate, now);
              const dleft = r.dueDate ? daysUntil(r.dueDate) : null;
              return (
                <TableRow key={r.id} className="cursor-pointer">
                  <TableCell className="font-medium">
                    <Link href={`/borrow/${r.id}`} className="hover:underline">{r.refNo}</Link>
                  </TableCell>
                  <TableCell>
                    {r.requesterName ?? `${r.requester.firstName} ${r.requester.lastName}`}
                  </TableCell>
                  <TableCell>{r.department?.name ?? "—"}</TableCell>
                  <TableCell className="text-center">{r._count.items}</TableCell>
                  <TableCell>
                    {r.dueDate ? (
                      <span className={dleft !== null && dleft < 0 ? "text-destructive" : ""}>
                        {formatDate(r.dueDate)}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell><StatusBadge status={display} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Pagination
        page={page}
        pageCount={Math.ceil(total / take)}
        basePath="/borrow"
        searchParams={sp}
      />
    </div>
  );
}
