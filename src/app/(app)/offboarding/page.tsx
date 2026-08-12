import Link from "next/link";
import { Check, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { Prisma } from "@prisma/client";

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

function ChecklistIcon({ done, label }: { done: boolean; label: string }) {
  return (
    <span title={label} className="inline-flex">
      {done ? (
        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <X className="h-4 w-4 text-muted-foreground" />
      )}
    </span>
  );
}

export default async function OffboardingListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("offboarding:read");
  const sp = await searchParams;
  const { page, skip, take } = parsePage(sp.page);
  const status = STATUS_OPTIONS.includes(sp.status as (typeof STATUS_OPTIONS)[number])
    ? (sp.status as (typeof STATUS_OPTIONS)[number])
    : undefined;
  const q = sp.q?.trim() || undefined;

  const where: Prisma.OffboardingWhereInput = {
    organizationId: user.organizationId,
    ...(status ? { status } : {}),
    ...(q
      ? {
          employee: {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { employeeCode: { contains: q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.offboarding.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.offboarding.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader
        title="Offboarding"
        description={`กระบวนการพ้นสภาพพนักงาน ทั้งหมด ${total} รายการ / ${total} records`}
      />

      <SearchFilterBar
        action="/offboarding"
        q={sp.q}
        placeholder="ค้นหาพนักงาน / Search employee..."
        filters={[
          {
            name: "status",
            value: sp.status,
            allLabel: "ทุกสถานะ / All statuses",
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s.replaceAll("_", " ") })),
          },
        ]}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>พนักงาน / Employee</TableHead>
            <TableHead>แผนก / Department</TableHead>
            <TableHead>เริ่ม / Started</TableHead>
            <TableHead>สถานะ / Status</TableHead>
            <TableHead>เช็คลิสต์ / Checklist</TableHead>
            <TableHead>เสร็จสิ้น / Completed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                ไม่พบข้อมูล / No offboarding records found
              </TableCell>
            </TableRow>
          )}
          {rows.map((o) => (
            <TableRow key={o.id}>
              <TableCell>
                <Link href={`/offboarding/${o.id}`} className="font-medium text-primary hover:underline">
                  {o.employee.firstName} {o.employee.lastName}
                </Link>
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {o.employee.employeeCode}
                </span>
              </TableCell>
              <TableCell>{o.employee.department?.name ?? "-"}</TableCell>
              <TableCell>{formatDate(o.createdAt)}</TableCell>
              <TableCell>
                <StatusBadge status={o.status} />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <ChecklistIcon done={o.assetsReturned} label="ทรัพย์สิน / Assets" />
                  <ChecklistIcon done={o.licensesRevoked} label="ไลเซนส์ / Licenses" />
                  <ChecklistIcon done={o.vaultRevoked} label="Vault" />
                  <ChecklistIcon done={o.accountDisabled} label="บัญชีผู้ใช้ / Account" />
                </div>
              </TableCell>
              <TableCell>{formatDate(o.completedAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination page={page} pageCount={pageCount} basePath="/offboarding" searchParams={sp} />
    </div>
  );
}
