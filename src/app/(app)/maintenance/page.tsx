import Link from "next/link";
import { Plus, Upload } from "lucide-react";
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
import { formatDate } from "@/lib/utils";

const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_PART",
  "WAITING_VENDOR",
  "COMPLETED",
  "CANCELLED",
] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("maintenance:read")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const q = sp.q?.trim() || undefined;
  const status = STATUSES.find((s) => s === sp.status);
  const priority = PRIORITIES.find((p) => p === sp.priority);
  const { page, skip, take } = parsePage(sp.page);

  const where = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(q
      ? {
          OR: [
            { ticketNumber: { contains: q, mode: "insensitive" as const } },
            { problem: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [tickets, total, openCount, inProgressCount, completedThisMonth] = await Promise.all([
    prisma.maintenanceTicket.findMany({
      where,
      include: { asset: { select: { assetTag: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.maintenanceTicket.count({ where }),
    prisma.maintenanceTicket.count({
      where: { organizationId: user.organizationId, deletedAt: null, status: "OPEN" },
    }),
    prisma.maintenanceTicket.count({
      where: { organizationId: user.organizationId, deletedAt: null, status: "IN_PROGRESS" },
    }),
    prisma.maintenanceTicket.count({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: "COMPLETED",
        completedAt: { gte: monthStart },
      },
    }),
  ]);

  // Technician names (no Prisma relation on technicianId) — look up in one query.
  const technicianIds = [
    ...new Set(tickets.map((t) => t.technicianId).filter((v): v is string => !!v)),
  ];
  const technicians = technicianIds.length
    ? await prisma.employee.findMany({
        where: { id: { in: technicianIds }, organizationId: user.organizationId },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const technicianMap = new Map(
    technicians.map((t) => [t.id, `${t.firstName} ${t.lastName}`])
  );

  const canManage = user.permissions.has("maintenance:manage");
  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader
        title="งานแจ้งซ่อม / Maintenance"
        description="ติดตามงานซ่อมบำรุงทรัพย์สิน / Track asset maintenance tickets"
      >
        {canManage && (
          <>
            <Button variant="outline" asChild>
              <Link href="/maintenance/import">
                <Upload className="h-4 w-4" /> นำเข้า / Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/maintenance/new">
                <Plus className="h-4 w-4" /> แจ้งซ่อม / New Ticket
              </Link>
            </Button>
          </>
        )}
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="เปิดใหม่ / Open" value={openCount} tone={openCount > 0 ? "warning" : "default"} />
        <StatCard label="กำลังดำเนินการ / In Progress" value={inProgressCount} />
        <StatCard
          label="เสร็จเดือนนี้ / Completed This Month"
          value={completedThisMonth}
          tone="success"
        />
      </div>

      <SearchFilterBar
        action="/maintenance"
        q={q}
        placeholder="ค้นหาเลขที่/ปัญหา / Search ticket # or problem..."
        filters={[
          {
            name: "status",
            value: status,
            allLabel: "ทุกสถานะ / All statuses",
            options: STATUSES.map((s) => ({ value: s, label: s.replaceAll("_", " ") })),
          },
          {
            name: "priority",
            value: priority,
            allLabel: "ทุกความสำคัญ / All priorities",
            options: PRIORITIES.map((p) => ({ value: p, label: p })),
          },
        ]}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขที่ / Ticket #</TableHead>
            <TableHead>ทรัพย์สิน / Asset</TableHead>
            <TableHead>ปัญหา / Problem</TableHead>
            <TableHead>ความสำคัญ / Priority</TableHead>
            <TableHead>สถานะ / Status</TableHead>
            <TableHead>ช่าง / Technician</TableHead>
            <TableHead>แจ้งเมื่อ / Created</TableHead>
            <TableHead>เสร็จเมื่อ / Completed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tickets.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                ไม่พบข้อมูล / No tickets found
              </TableCell>
            </TableRow>
          )}
          {tickets.map((t) => (
            <TableRow key={t.id}>
              <TableCell>
                <Link href={`/maintenance/${t.id}`} className="font-medium text-primary hover:underline">
                  {t.ticketNumber}
                </Link>
              </TableCell>
              <TableCell>
                <span className="font-medium">{t.asset.assetTag}</span>{" "}
                <span className="text-muted-foreground">{t.asset.name}</span>
              </TableCell>
              <TableCell className="max-w-[240px] truncate" title={t.problem}>
                {t.problem}
              </TableCell>
              <TableCell>
                <StatusBadge status={t.priority} />
              </TableCell>
              <TableCell>
                <StatusBadge status={t.status} />
              </TableCell>
              <TableCell>
                {t.technicianId ? technicianMap.get(t.technicianId) ?? "-" : "-"}
              </TableCell>
              <TableCell>{formatDate(t.createdAt)}</TableCell>
              <TableCell>{formatDate(t.completedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination page={page} pageCount={pageCount} basePath="/maintenance" searchParams={sp} />
    </div>
  );
}
