import Link from "next/link";
import { Plus, Shield } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchFilterBar } from "@/components/list-controls";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export default async function PermissionProfilesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("permprofile:manage");
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const department = sp.department || undefined;

  const [rows, departments] = await Promise.all([
    prisma.permissionProfile.findMany({
      where: {
        organizationId: user.organizationId, deletedAt: null,
        ...(department ? { department } : {}),
        ...(q ? { OR: [
          { name: { contains: q, mode: "insensitive" } },
          { position: { contains: q, mode: "insensitive" } },
          { company: { contains: q, mode: "insensitive" } },
        ] } : {}),
      },
      include: { _count: { select: { items: true } } },
      orderBy: [{ department: "asc" }, { position: "asc" }, { jobLevel: "asc" }],
    }),
    prisma.permissionProfile.findMany({ where: { organizationId: user.organizationId, deletedAt: null, department: { not: null } }, select: { department: true }, distinct: ["department"], orderBy: { department: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="โปรไฟล์สิทธิ์ / Permission Profiles" description="กำหนดสิทธิ์มาตรฐานตามแผนก / ตำแหน่ง / ระดับ (ใช้กับแบบฟอร์มขอสิทธิ์)">
        <Button asChild><Link href="/settings/permission-profiles/new"><Plus className="h-4 w-4" /> สร้างโปรไฟล์ / New</Link></Button>
      </PageHeader>

      <SearchFilterBar
        action="/settings/permission-profiles"
        q={sp.q}
        placeholder="ค้นหา ชื่อ / ตำแหน่ง / บริษัท..."
        filters={[{ name: "department", value: sp.department, allLabel: "ทุกแผนก / All departments", options: departments.filter((d) => d.department).map((d) => ({ value: d.department as string, label: d.department as string })) }]}
      />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ / Name</TableHead>
              <TableHead>แผนก / Dept</TableHead>
              <TableHead>ตำแหน่ง / Position</TableHead>
              <TableHead>ระดับ / Level</TableHead>
              <TableHead className="text-right">สิทธิ์ / Items</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground"><Shield className="mx-auto mb-2 h-5 w-5" /> ยังไม่มีโปรไฟล์สิทธิ์</TableCell></TableRow>
            )}
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell><Link href={`/settings/permission-profiles/${p.id}`} className="font-medium text-primary hover:underline">{p.name}</Link></TableCell>
                <TableCell>{p.department ?? "—"}</TableCell>
                <TableCell>{p.position ?? "—"}</TableCell>
                <TableCell>{p.jobLevel ?? "—"}</TableCell>
                <TableCell className="text-right">{p._count.items}</TableCell>
                <TableCell><Badge variant={p.isActive ? "success" : "secondary"}>{p.isActive ? "Active" : "Inactive"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
