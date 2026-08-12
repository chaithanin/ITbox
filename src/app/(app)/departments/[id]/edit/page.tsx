import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateDepartment } from "../../actions";

export default async function EditDepartmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("department:manage");
  const { id } = await params;

  const department = await prisma.department.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!department) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`แก้ไขแผนก / Edit Department`} description={`${department.code} — ${department.name}`} />
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลแผนก / Department Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateDepartment} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={department.id} />
            <div className="space-y-1.5">
              <Label htmlFor="code">รหัส / Code *</Label>
              <Input id="code" name="code" required maxLength={50} defaultValue={department.code} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">ชื่อ / Name *</Label>
              <Input id="name" name="name" required maxLength={200} defaultValue={department.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="division">สายงาน / Division</Label>
              <Input id="division" name="division" maxLength={200} defaultValue={department.division ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="costCenter">Cost Center</Label>
              <Input id="costCenter" name="costCenter" maxLength={100} defaultValue={department.costCenter ?? ""} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">บันทึก / Save</Button>
              <Button variant="outline" asChild>
                <Link href={`/departments/${department.id}`}>ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
