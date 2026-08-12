import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Pagination, parsePage } from "@/components/list-controls";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const ENTITY_TYPES = [
  "AUTH",
  "ASSET",
  "EMPLOYEE",
  "VAULT_ITEM",
  "LICENSE",
  "PURCHASE_REQUEST",
  "MAINTENANCE",
  "USER",
  "VAULT_SHARE",
];

function str(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s ? s : undefined;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  if (!user.permissions.has("audit:read")) {
    return (
      <div>
        <PageHeader title="บันทึกตรวจสอบ / Audit Logs" />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (ต้องมีสิทธิ์ audit:read) / You do not have access to this
            page (requires audit:read).
          </CardContent>
        </Card>
      </div>
    );
  }

  const action = str(sp.action);
  const entityType = str(sp.entityType);
  const result = str(sp.result);
  const userQ = str(sp.user);
  const from = str(sp.from);
  const to = str(sp.to);
  const { page, skip, take } = parsePage(str(sp.page), PAGE_SIZE);

  const where: Prisma.AuditLogWhereInput = { organizationId: user.organizationId };
  if (action) where.action = { contains: action, mode: "insensitive" };
  if (entityType) where.entityType = entityType;
  if (result && ["SUCCESS", "DENIED", "FAILED"].includes(result)) where.result = result;
  if (from || to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) createdAt.gte = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) {
        createdAt.lt = new Date(d.getTime() + 24 * 60 * 60 * 1000); // inclusive end of day
      }
    }
    where.createdAt = createdAt;
  }
  if (userQ) {
    // Resolve email search to user ids within the same organization
    const matched = await prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        email: { contains: userQ, mode: "insensitive" },
      },
      select: { id: true },
      take: 100,
    });
    where.userId = { in: matched.map((u) => u.id) };
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="บันทึกตรวจสอบ / Audit Logs"
        description={`ทั้งหมด ${total.toLocaleString()} รายการ / ${total.toLocaleString()} entries`}
      />

      <form action="/audit-logs" method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
        <Input name="action" defaultValue={action} placeholder="Action (เช่น LOGIN)" />
        <Select name="entityType" defaultValue={entityType ?? ""}>
          <option value="">ทุกประเภท / All entities</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select name="result" defaultValue={result ?? ""}>
          <option value="">ทุกผลลัพธ์ / All results</option>
          <option value="SUCCESS">SUCCESS</option>
          <option value="DENIED">DENIED</option>
          <option value="FAILED">FAILED</option>
        </Select>
        <Input name="user" defaultValue={userQ} placeholder="อีเมลผู้ใช้ / User email" />
        <Input type="date" name="from" defaultValue={from} aria-label="จากวันที่ / From date" />
        <Input type="date" name="to" defaultValue={to} aria-label="ถึงวันที่ / To date" />
        <Button type="submit" variant="secondary">
          <Search className="h-4 w-4" />
          กรอง / Filter
        </Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>เวลา / Time</TableHead>
            <TableHead>ผู้ใช้ / User</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Entity ID</TableHead>
            <TableHead>ผลลัพธ์ / Result</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>รายละเอียด / Detail</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                ไม่พบข้อมูล / No entries found
              </TableCell>
            </TableRow>
          )}
          {logs.map((l) => {
            const detail = l.detail === null ? "" : JSON.stringify(l.detail);
            return (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(l.createdAt)}
                </TableCell>
                <TableCell>
                  {l.user ? (
                    <span title={l.user.email}>{l.user.name}</span>
                  ) : (
                    <span className="text-muted-foreground">ระบบ / System</span>
                  )}
                </TableCell>
                <TableCell className="font-medium">{l.action}</TableCell>
                <TableCell>{l.entityType ?? "-"}</TableCell>
                <TableCell className="font-mono text-xs" title={l.entityId ?? undefined}>
                  {l.entityId ? truncate(l.entityId, 8) : "-"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={l.result} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{l.ip ?? "-"}</TableCell>
                <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground" title={detail}>
                  {detail ? truncate(detail, 120) : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Pagination
        page={page}
        pageCount={pageCount}
        basePath="/audit-logs"
        searchParams={{ action, entityType, result, user: userQ, from, to }}
      />
    </div>
  );
}
