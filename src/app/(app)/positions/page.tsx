import Link from "next/link";
import { Plus, Pencil } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { StatusBadge } from "@/components/status-badge";
import { Highlight } from "@/components/highlight";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function PositionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("employee:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const canManage = user.permissions.has("permprofile:manage");
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const { page, skip, take } = parsePage(sp.page);

  const where: Prisma.PositionWhereInput = {
    organizationId: user.organizationId, deletedAt: null,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [rows, total, departments] = await Promise.all([
    prisma.position.findMany({ where, include: { department: { select: { name: true } } }, orderBy: [{ name: "asc" }], skip, take }),
    prisma.position.count({ where }),
    prisma.department.findMany({ where: { organizationId: user.organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader title="ตำแหน่งงาน / Positions" description={`ทะเบียนตำแหน่งงานสำหรับกำหนดสิทธิ์เริ่มต้น · ${total} ตำแหน่ง`}>
        {canManage && <Button asChild><Link href="/positions/new"><Plus className="h-4 w-4" /> เพิ่มตำแหน่ง / New</Link></Button>}
      </PageHeader>
      <SearchFilterBar action="/positions" q={sp.q} placeholder="ค้นหาชื่อ/รหัสตำแหน่ง..." filters={[
        { name: "departmentId", value: sp.departmentId, allLabel: "ทุกแผนก / All departments", options: departments.map((d) => ({ value: d.id, label: d.name })) },
      ]} />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>รหัส / Code</TableHead><TableHead>ชื่อตำแหน่ง / Position</TableHead>
            <TableHead>แผนก / Department</TableHead><TableHead>ระดับ / Level</TableHead>
            <TableHead>สถานะ / Status</TableHead><TableHead className="text-right">จัดการ</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ไม่พบตำแหน่งงาน / No positions</TableCell></TableRow>}
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs"><Highlight text={p.code ?? "-"} term={q} /></TableCell>
                <TableCell className="font-medium"><Highlight text={p.name} term={q} /></TableCell>
                <TableCell>{p.department?.name ?? "-"}</TableCell>
                <TableCell>{p.jobLevel ?? "-"}</TableCell>
                <TableCell><StatusBadge status={p.isActive ? "ACTIVE" : "INACTIVE"} /></TableCell>
                <TableCell className="text-right">
                  {canManage && <Button variant="ghost" size="sm" asChild><Link href={`/positions/${p.id}/edit`}><Pencil className="h-4 w-4" /></Link></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} pageCount={pageCount} basePath="/positions" searchParams={sp} />
    </div>
  );
}
