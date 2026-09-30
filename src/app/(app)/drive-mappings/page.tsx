import Link from "next/link";
import { HardDrive, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

const STATUSES = ["DRAFT", "ACTIVE", "DONE"] as const;

export default async function DriveMappingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("support:read");
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? (sp.status as (typeof STATUSES)[number]) : undefined;
  const { page, skip, take } = parsePage(sp.page);
  const canManage = user.permissions.has("support:work");

  const where: Prisma.DriveMappingWhereInput = {
    organizationId: user.organizationId, deletedAt: null,
    ...(status ? { status } : {}),
    ...(q ? { OR: [
      { employeeName: { contains: q, mode: "insensitive" } },
      { employeeCode: { contains: q, mode: "insensitive" } },
      { computerName: { contains: q, mode: "insensitive" } },
      { userShare: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.driveMapping.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.driveMapping.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader title="ตั้งค่าไดรฟ์และผู้ใช้ / Drive & User Setup" description={`ทั้งหมด ${total} รายการ`}>
        {canManage && (
          <Button asChild><Link href="/drive-mappings/new"><Plus className="h-4 w-4" /> สร้างใหม่ / New</Link></Button>
        )}
      </PageHeader>

      <SearchFilterBar
        action="/drive-mappings" q={sp.q} placeholder="ค้นหา ชื่อ / รหัส / เครื่อง / share..."
        filters={[{ name: "status", value: sp.status, allLabel: "ทุกสถานะ / All", options: STATUSES.map((s) => ({ value: s, label: s })) }]}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>พนักงาน / Employee</TableHead><TableHead>เครื่อง/ผู้ใช้ / Computer</TableHead>
            <TableHead>User Share</TableHead><TableHead className="text-right">ไดรฟ์</TableHead>
            <TableHead>วันที่ / Date</TableHead><TableHead>สถานะ</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground"><HardDrive className="mx-auto mb-2 h-5 w-5" /> ยังไม่มีรายการ</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Link href={`/drive-mappings/${r.id}`} className="font-medium text-primary hover:underline">{r.employeeName || "—"}</Link>
                  {r.employeeCode && <span className="ml-1 text-xs text-muted-foreground">{r.employeeCode}</span>}
                  {r.position && <div className="text-xs text-muted-foreground">{r.position}</div>}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.computerName ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{r.userShare ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.drives.length}</TableCell>
                <TableCell className="text-xs">{formatDate(r.createdAt)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} pageCount={pageCount} basePath="/drive-mappings" searchParams={sp} />
    </div>
  );
}
