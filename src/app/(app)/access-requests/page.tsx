import Link from "next/link";
import { KeyRound, Download } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PROVISIONED", "REVOKED"] as const;

export default async function AccessRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("accessreq:read");
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? (sp.status as (typeof STATUSES)[number]) : undefined;
  const { page, skip, take } = parsePage(sp.page);

  const where: Prisma.AccessRequestWhereInput = {
    organizationId: user.organizationId, deletedAt: null,
    ...(status ? { status } : {}),
    ...(q ? { OR: [
      { nameEn: { contains: q, mode: "insensitive" } },
      { nameTh: { contains: q, mode: "insensitive" } },
      { employeeCode: { contains: q, mode: "insensitive" } },
      { department: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.accessRequest.findMany({ where, include: { _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.accessRequest.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / take));

  // Status breakdown across the whole org (ignores search/filter) for the summary strip.
  const byStatus = await prisma.accessRequest.groupBy({
    by: ["status"], where: { organizationId: user.organizationId, deletedAt: null }, _count: true,
  });
  const statusCount = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const canExport = user.permissions.has("report:export");
  const exportQs = new URLSearchParams({ ...(status ? { status } : {}) }).toString();

  return (
    <div>
      <PageHeader title="คำขอสิทธิ์ / Access Requests" description={`ทั้งหมด ${total} คำขอ`}>
        {canExport && (
          <>
            <Button variant="outline" asChild><a href={`/api/reports/access-requests?format=xlsx${exportQs ? "&" + exportQs : ""}`}><Download className="h-4 w-4" /> Excel</a></Button>
            <Button variant="outline" asChild><a href={`/api/reports/access-requests?format=pdf${exportQs ? "&" + exportQs : ""}`}><Download className="h-4 w-4" /> PDF</a></Button>
          </>
        )}
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {STATUSES.map((s) => (
          <Link key={s} href={`/access-requests?status=${s}`} className="rounded-full border px-2.5 py-1 hover:bg-muted">
            <StatusBadge status={s} /> <span className="ml-1 font-semibold tabular-nums">{statusCount(s)}</span>
          </Link>
        ))}
      </div>

      <SearchFilterBar
        action="/access-requests" q={sp.q} placeholder="ค้นหา ชื่อ / รหัส / แผนก..."
        filters={[{ name: "status", value: sp.status, allLabel: "ทุกสถานะ / All", options: STATUSES.map((s) => ({ value: s, label: s })) }]}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>ผู้ขอ / Requester</TableHead><TableHead>แผนก / Dept</TableHead>
            <TableHead>ตำแหน่ง/ระดับ</TableHead><TableHead className="text-right">สิทธิ์</TableHead>
            <TableHead>วันที่ / Date</TableHead><TableHead>สถานะ</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground"><KeyRound className="mx-auto mb-2 h-5 w-5" /> ยังไม่มีคำขอ</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/access-requests/${r.id}`} className="font-medium text-primary hover:underline">{r.nameEn || r.nameTh || "—"}</Link>
                  <span className="ml-1 text-xs text-muted-foreground">{r.employeeCode}</span>
                </TableCell>
                <TableCell>{r.department ?? "—"}</TableCell>
                <TableCell>{[r.position, r.jobLevel].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="text-right">{r._count.items}</TableCell>
                <TableCell>{formatDate(r.createdAt)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} pageCount={pageCount} basePath="/access-requests" searchParams={sp} />
    </div>
  );
}
