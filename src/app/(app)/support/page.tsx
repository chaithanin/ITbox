import Link from "next/link";
import { Plus, Headset } from "lucide-react";
import type { CaseStatus, Prisma } from "@prisma/client";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Pagination, parsePage } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn, formatDateTime } from "@/lib/utils";

const STATUS_GROUPS: Record<string, CaseStatus[]> = {
  open: ["NEW", "TRIAGE", "ASSIGNED", "IN_PROGRESS", "REOPENED", "WAITING_VENDOR"],
  waiting: ["WAITING_USER"],
  resolved: ["RESOLVED"],
  closed: ["CLOSED", "CANCELLED", "DUPLICATE"],
};

const TABS: { key: string; label: string }[] = [
  { key: "all", label: "ทั้งหมด / All" },
  { key: "open", label: "กำลังดำเนินการ / Open" },
  { key: "waiting", label: "รอฉันตอบกลับ / Waiting" },
  { key: "resolved", label: "รอยืนยัน / Resolved" },
  { key: "closed", label: "ปิดแล้ว / Closed" },
];

export default async function MyCasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireUser();

  const group = sp.status && STATUS_GROUPS[sp.status] ? sp.status : "all";
  const { page, skip, take } = parsePage(sp.page);

  const mine: Prisma.SupportCaseWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    OR: [{ requesterId: user.id }, { createdById: user.id }],
  };

  const where: Prisma.SupportCaseWhereInput = {
    ...mine,
    ...(group !== "all" ? { status: { in: STATUS_GROUPS[group] } } : {}),
  };

  const [cases, total, openCount, waitingCount, resolvedCount, closedCount] = await Promise.all([
    prisma.supportCase.findMany({
      where,
      include: {
        type: { select: { name: true, nameTh: true } },
        assignedUser: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    prisma.supportCase.count({ where }),
    prisma.supportCase.count({ where: { ...mine, status: { in: STATUS_GROUPS.open } } }),
    prisma.supportCase.count({ where: { ...mine, status: { in: STATUS_GROUPS.waiting } } }),
    prisma.supportCase.count({ where: { ...mine, status: "RESOLVED" } }),
    prisma.supportCase.count({ where: { ...mine, status: "CLOSED" } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / take));
  const canCreate = user.permissions.has("support:create");
  const isAgent = user.permissions.has("support:read");

  return (
    <div>
      <PageHeader
        title="เคสของฉัน / My Cases"
        description="ติดตามคำขอความช่วยเหลือ IT ของคุณ / Track your IT support requests"
      >
        {isAgent && (
          <Button variant="outline" asChild>
            <Link href="/support/queue">
              <Headset className="h-4 w-4" /> ไปที่คิวงาน IT / IT Queue
            </Link>
          </Button>
        )}
        {canCreate && (
          <Button asChild>
            <Link href="/support/new">
              <Plus className="h-4 w-4" /> เปิดเคส IT Support / New Case
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="กำลังดำเนินการ / Open"
          value={openCount}
          href="/support?status=open"
          tone={openCount > 0 ? "warning" : "default"}
        />
        <StatCard
          label="รอฉันตอบกลับ / Waiting for me"
          value={waitingCount}
          href="/support?status=waiting"
          tone={waitingCount > 0 ? "danger" : "default"}
        />
        <StatCard
          label="รอยืนยัน / Awaiting confirm"
          value={resolvedCount}
          href="/support?status=resolved"
          tone={resolvedCount > 0 ? "success" : "default"}
        />
        <StatCard label="ปิดแล้ว / Closed" value={closedCount} href="/support?status=closed" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = group === t.key || (t.key === "all" && group === "all");
          const href = t.key === "all" ? "/support" : `/support?status=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              className={cn(
                "rounded-full border px-3 py-1 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {cases.length === 0 ? (
        <p className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
          ยังไม่มีเคส / No cases found.{" "}
          {canCreate && (
            <Link href="/support/new" className="text-primary hover:underline">
              เปิดเคสใหม่ / Open a new case
            </Link>
          )}
        </p>
      ) : (
        <>
          {/* Mobile: tap-friendly cards */}
          <ul className="space-y-2.5 md:hidden">
            {cases.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/support/${c.id}`}
                  className="block rounded-xl border bg-card p-3.5 active:bg-accent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{c.caseNumber}</span>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      <StatusBadge status={c.priority} />
                      <StatusBadge status={c.status} />
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm font-medium">{c.subject}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{c.type ? c.type.nameTh ?? c.type.name : "-"}</span>
                    <span>ผู้รับผิดชอบ: {c.assignedUser?.name ?? "-"}</span>
                    <span className="ml-auto">{formatDateTime(c.updatedAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: full table */}
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>เลขที่ / Case #</TableHead>
                  <TableHead>เรื่อง / Subject</TableHead>
                  <TableHead>ประเภท / Type</TableHead>
                  <TableHead>ความเร่งด่วน / Priority</TableHead>
                  <TableHead>สถานะ / Status</TableHead>
                  <TableHead>ผู้รับผิดชอบ / Agent</TableHead>
                  <TableHead>อัปเดต / Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/support/${c.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {c.caseNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate" title={c.subject}>
                      {c.subject}
                    </TableCell>
                    <TableCell>{c.type ? c.type.nameTh ?? c.type.name : "-"}</TableCell>
                    <TableCell>
                      <StatusBadge status={c.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={c.status} />
                    </TableCell>
                    <TableCell>{c.assignedUser?.name ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(c.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Pagination page={page} pageCount={pageCount} basePath="/support" searchParams={sp} />
    </div>
  );
}
