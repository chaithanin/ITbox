import Link from "next/link";
import type { Prisma, CaseStatus, CasePriority } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { PRIORITY_LABEL } from "@/lib/services/support";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const OPEN_STATUSES: CaseStatus[] = [
  "NEW",
  "TRIAGE",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_USER",
  "WAITING_VENDOR",
  "REOPENED",
];

const ALL_STATUSES: CaseStatus[] = [
  ...OPEN_STATUSES,
  "RESOLVED",
  "CLOSED",
  "CANCELLED",
  "DUPLICATE",
];

const PRIORITIES: CasePriority[] = ["P1", "P2", "P3", "P4"];

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
  NEW: "ใหม่ / New",
  TRIAGE: "คัดแยก / Triage",
  ASSIGNED: "มอบหมายแล้ว / Assigned",
  IN_PROGRESS: "กำลังดำเนินการ / In progress",
  WAITING_USER: "รอผู้ใช้ / Waiting user",
  WAITING_VENDOR: "รอผู้ขาย / Waiting vendor",
  REOPENED: "เปิดใหม่ / Reopened",
  RESOLVED: "แก้ไขแล้ว / Resolved",
  CLOSED: "ปิดแล้ว / Closed",
  CANCELLED: "ยกเลิก / Cancelled",
  DUPLICATE: "ซ้ำ / Duplicate",
};

function relativeSla(due: Date, now: Date): string {
  const diff = due.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  let unit: string;
  if (mins < 60) unit = `${mins} นาที`;
  else if (mins < 60 * 24) unit = `${Math.round(mins / 60)} ชม.`;
  else unit = `${Math.round(mins / (60 * 24))} วัน`;
  return diff >= 0 ? `เหลือ ${unit}` : `เกิน ${unit}`;
}

function isUuid(v: string | undefined): v is string {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export default async function SupportQueuePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("support:read")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงคิวงาน IT / You do not have access to the IT queue.
      </p>
    );
  }

  const sp = await searchParams;
  const { page, skip, take } = parsePage(sp.page, 25);
  const q = sp.q?.trim() || undefined;
  const status = ALL_STATUSES.includes(sp.status as CaseStatus)
    ? (sp.status as CaseStatus)
    : undefined;
  const priority = PRIORITIES.includes(sp.priority as CasePriority)
    ? (sp.priority as CasePriority)
    : undefined;
  const teamId = isUuid(sp.teamId) ? sp.teamId : undefined;
  const categoryId = isUuid(sp.categoryId) ? sp.categoryId : undefined;
  const assignee = sp.assignee?.trim() || undefined;

  let assigneeWhere: Prisma.SupportCaseWhereInput = {};
  if (assignee === "me") assigneeWhere = { assignedUserId: user.id };
  else if (assignee === "unassigned") assigneeWhere = { assignedUserId: null };
  else if (isUuid(assignee)) assigneeWhere = { assignedUserId: assignee };

  const where: Prisma.SupportCaseWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { caseNumber: { contains: q, mode: "insensitive" } },
            { subject: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status ? { status } : { status: { in: OPEN_STATUSES } }),
    ...(priority ? { priority } : {}),
    ...(teamId ? { assignedTeamId: teamId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...assigneeWhere,
  };

  const orgScope = { organizationId: user.organizationId, deletedAt: null };

  const [
    cases,
    total,
    newUnassigned,
    inProgress,
    waiting,
    slaBreached,
    p1Open,
    teams,
    categories,
    agents,
  ] = await Promise.all([
    prisma.supportCase.findMany({
      where,
      orderBy: [{ priority: "asc" }, { resolutionDueAt: "asc" }],
      skip,
      take,
      include: {
        type: { select: { name: true, nameTh: true } },
        requester: { select: { name: true } },
        assignedUser: { select: { name: true } },
      },
    }),
    prisma.supportCase.count({ where }),
    prisma.supportCase.count({
      where: {
        ...orgScope,
        status: { in: OPEN_STATUSES },
        OR: [{ status: "NEW" }, { assignedUserId: null }],
      },
    }),
    prisma.supportCase.count({ where: { ...orgScope, status: "IN_PROGRESS" } }),
    prisma.supportCase.count({
      where: { ...orgScope, status: { in: ["WAITING_USER", "WAITING_VENDOR"] } },
    }),
    prisma.supportCase.count({
      where: { ...orgScope, resolutionBreached: true, status: { in: NOT_RESOLVED } },
    }),
    prisma.supportCase.count({
      where: { ...orgScope, priority: "P1", status: { in: OPEN_STATUSES } },
    }),
    prisma.supportTeam.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, active: true },
      select: { id: true, name: true, nameTh: true },
      orderBy: { name: "asc" },
    }),
    prisma.caseCategory.findMany({
      where: { organizationId: user.organizationId, parentId: null, active: true },
      select: { id: true, name: true, nameTh: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: "ACTIVE",
        supportTeamMemberships: { some: {} },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Fallback: if no team members configured, offer all active users as agents.
  const agentOptions =
    agents.length > 0
      ? agents
      : await prisma.user.findMany({
          where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
          take: 200,
        });

  const pageCount = Math.max(1, Math.ceil(total / take));
  const now = new Date();

  const assigneeOptions = [
    { value: "me", label: "มอบหมายให้ฉัน / Assigned to me" },
    { value: "unassigned", label: "ยังไม่มอบหมาย / Unassigned" },
    ...agentOptions.map((a) => ({ value: a.id, label: a.name })),
  ];

  return (
    <div>
      <PageHeader
        title="คิวงาน IT / IT Work Queue"
        description="เคสที่เปิดอยู่ เรียงตามความสำคัญและกำหนด SLA"
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="ใหม่/ยังไม่มอบหมาย"
          value={newUnassigned}
          tone="warning"
          href="/support/queue?assignee=unassigned"
        />
        <StatCard label="กำลังดำเนินการ" value={inProgress} href="/support/queue?status=IN_PROGRESS" />
        <StatCard
          label="กำลังรอ"
          value={waiting}
          tone="warning"
          href="/support/queue?status=WAITING_USER"
        />
        <StatCard label="เกิน SLA" value={slaBreached} tone="danger" />
        <StatCard label="P1 ที่เปิดอยู่" value={p1Open} tone="danger" href="/support/queue?priority=P1" />
      </div>

      <SearchFilterBar
        action="/support/queue"
        q={sp.q}
        placeholder="ค้นหาเลขเคส/หัวข้อ / Search case no. or subject..."
        filters={[
          {
            name: "status",
            value: sp.status,
            allLabel: "ทุกสถานะ (เปิดอยู่) / Open",
            options: ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
          },
          {
            name: "priority",
            value: sp.priority,
            allLabel: "ทุกความสำคัญ / All priorities",
            options: PRIORITIES.map((p) => ({
              value: p,
              label: `${p} · ${PRIORITY_LABEL[p].th}`,
            })),
          },
          {
            name: "assignee",
            value: sp.assignee,
            allLabel: "ผู้รับผิดชอบทั้งหมด / All assignees",
            options: assigneeOptions,
          },
          {
            name: "teamId",
            value: sp.teamId,
            allLabel: "ทุกทีม / All teams",
            options: teams.map((t) => ({ value: t.id, label: t.nameTh || t.name })),
          },
          {
            name: "categoryId",
            value: sp.categoryId,
            allLabel: "ทุกหมวดหมู่ / All categories",
            options: categories.map((c) => ({ value: c.id, label: c.nameTh || c.name })),
          },
        ]}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เลขเคส</TableHead>
            <TableHead>หัวข้อ</TableHead>
            <TableHead>ประเภท</TableHead>
            <TableHead>ความสำคัญ</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>ผู้แจ้ง</TableHead>
            <TableHead>ผู้รับผิดชอบ</TableHead>
            <TableHead>SLA</TableHead>
            <TableHead>อัปเดต</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cases.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                ไม่พบเคส / No cases found
              </TableCell>
            </TableRow>
          ) : (
            cases.map((c) => {
              const due = c.resolutionDueAt;
              const isResolved = !NOT_RESOLVED.includes(c.status);
              const breached = !isResolved && (c.resolutionBreached || (due != null && due < now));
              const soon =
                !breached && !isResolved && due != null && due.getTime() - now.getTime() < 2 * 60 * 60 * 1000;
              const slaClass = breached
                ? "text-destructive dark:text-red-400 font-medium"
                : soon
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground";
              return (
                <TableRow key={c.id} className="cursor-pointer">
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    <Link href={`/support/${c.id}`} className="hover:underline">
                      {c.caseNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[16rem]">
                    <Link href={`/support/${c.id}`} className="block truncate hover:underline">
                      {c.subject}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {c.type ? c.type.nameTh || c.type.name : "-"}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.priority} label={`${c.priority} · ${PRIORITY_LABEL[c.priority].th}`} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{c.requester?.name ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {c.assignedUser?.name ?? (
                      <span className="text-muted-foreground">— ยังไม่มอบหมาย</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs">
                    <span className={slaClass}>
                      {breached ? "เกิน SLA" : due ? relativeSla(due, now) : "-"}
                    </span>
                    {c.firstResponseBreached && (
                      <span className="ml-1 rounded bg-destructive/10 px-1 py-0.5 text-[10px] font-semibold text-destructive dark:text-red-400">
                        FR
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(c.updatedAt)}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <Pagination page={page} pageCount={pageCount} basePath="/support/queue" searchParams={sp} />
    </div>
  );
}
