import Link from "next/link";
import { Plus, Shield } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchFilterBar } from "@/components/list-controls";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { seedDefaultProfiles } from "./actions";

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
      <PageHeader title="Default Permission — โปรไฟล์สิทธิ์ตามตำแหน่ง" description="กำหนดสิทธิ์มาตรฐานตามแผนก / ตำแหน่ง / ระดับ (Least Privilege) — role ในระบบ + คำขอสิทธิ์ระบบภายนอก">
        <form action={seedDefaultProfiles}><Button type="submit" variant="outline"><Shield className="h-4 w-4" /> สร้าง Default Profiles มาตรฐาน</Button></form>
        <Button asChild><Link href="/settings/permission-profiles/new"><Plus className="h-4 w-4" /> สร้างโปรไฟล์ / New</Link></Button>
      </PageHeader>
      {sp.seeded !== undefined && (
        <div className="mb-4 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">สร้าง Default Profiles มาตรฐานแล้ว {sp.seeded} รายการ (ข้ามที่มีอยู่แล้ว) — โปรดตรวจสอบ/ปรับก่อนใช้งาน</div>
      )}

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
              <TableHead>รหัส / Code</TableHead>
              <TableHead>ชื่อ / Name</TableHead>
              <TableHead>แผนก / Dept</TableHead>
              <TableHead>ตำแหน่ง / Position</TableHead>
              <TableHead>ระดับ / Level</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead className="text-right">สิทธิ์ / Items</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground"><Shield className="mx-auto mb-2 h-5 w-5" /> ยังไม่มีโปรไฟล์สิทธิ์ — กด “สร้าง Default Profiles มาตรฐาน”</TableCell></TableRow>
            )}
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.code ?? "—"}</TableCell>
                <TableCell><Link href={`/settings/permission-profiles/${p.id}`} className="font-medium text-primary hover:underline">{p.name}</Link></TableCell>
                <TableCell>{p.department ?? "—"}</TableCell>
                <TableCell>{p.position ?? "—"}</TableCell>
                <TableCell>{p.jobLevel ?? "—"}</TableCell>
                <TableCell>{p.roleKey ? <Badge variant="secondary">{p.roleKey}</Badge> : "—"}</TableCell>
                <TableCell className="text-xs">{p.projectScope ?? "—"}</TableCell>
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
