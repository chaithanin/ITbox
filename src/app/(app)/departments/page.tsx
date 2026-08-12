import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { Prisma } from "@prisma/client";
import { createDepartment, softDeleteDepartment } from "./actions";

export default async function DepartmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("department:read");
  const sp = await searchParams;
  const { page, skip, take } = parsePage(sp.page);
  const q = sp.q?.trim() || undefined;
  const canManage = user.permissions.has("department:manage");

  const where: Prisma.DepartmentWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
            { division: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.department.findMany({
      where,
      include: {
        _count: {
          select: {
            employees: { where: { deletedAt: null } },
            assets: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { code: "asc" },
      skip,
      take,
    }),
    prisma.department.count({ where }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader title="แผนก / Departments" description={`ทั้งหมด ${total} แผนก / ${total} departments`} />

      {canManage && (
        <Card className="mb-5">
          <CardHeader>
            <CardTitle>เพิ่มแผนก / New Department</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createDepartment} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor="code">รหัส / Code *</Label>
                <Input id="code" name="code" required maxLength={50} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">ชื่อ / Name *</Label>
                <Input id="name" name="name" required maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="division">สายงาน / Division</Label>
                <Input id="division" name="division" maxLength={200} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="costCenter">Cost Center</Label>
                <Input id="costCenter" name="costCenter" maxLength={100} />
              </div>
              <div className="flex items-end">
                <Button type="submit">
                  <Plus className="h-4 w-4" />
                  เพิ่ม / Add
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <SearchFilterBar action="/departments" q={sp.q} placeholder="ค้นหาแผนก / Search departments..." />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัส / Code</TableHead>
            <TableHead>ชื่อ / Name</TableHead>
            <TableHead>สายงาน / Division</TableHead>
            <TableHead>Cost Center</TableHead>
            <TableHead className="text-right">พนักงาน / Employees</TableHead>
            <TableHead className="text-right">ทรัพย์สิน / Assets</TableHead>
            {canManage && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={canManage ? 7 : 6} className="py-8 text-center text-muted-foreground">
                ไม่พบข้อมูล / No departments found
              </TableCell>
            </TableRow>
          )}
          {rows.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-mono text-xs">{d.code}</TableCell>
              <TableCell>
                <Link href={`/departments/${d.id}`} className="font-medium text-primary hover:underline">
                  {d.name}
                </Link>
              </TableCell>
              <TableCell>{d.division ?? "-"}</TableCell>
              <TableCell>{d.costCenter ?? "-"}</TableCell>
              <TableCell className="text-right">{d._count.employees}</TableCell>
              <TableCell className="text-right">{d._count.assets}</TableCell>
              {canManage && (
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/departments/${d.id}/edit`}>
                        <Pencil className="h-3.5 w-3.5" />
                        แก้ไข / Edit
                      </Link>
                    </Button>
                    {d._count.employees === 0 && (
                      <form action={softDeleteDepartment}>
                        <input type="hidden" name="id" value={d.id} />
                        <ConfirmButton
                          variant="outline"
                          size="sm"
                          confirmText={`ลบแผนก ${d.name}? / Delete department ${d.name}?`}
                        >
                          ลบ / Delete
                        </ConfirmButton>
                      </form>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination page={page} pageCount={pageCount} basePath="/departments" searchParams={sp} />
    </div>
  );
}
