import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { transferAsset } from "../actions";

export default async function TransferAssetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("asset:transfer")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  const sp = await searchParams;
  const preselectedAssetId = sp.assetId?.trim() || undefined;

  const [assets, departments, locations, employees] = await Promise.all([
    prisma.asset.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { notIn: ["DISPOSED"] },
      },
      orderBy: { assetTag: "asc" },
      select: { id: true, assetTag: true, name: true },
    }),
    prisma.department.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.location.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.employee.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
      orderBy: { employeeCode: "asc" },
      select: { id: true, employeeCode: true, firstName: true, lastName: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="โอนย้ายทรัพย์สิน / Transfer Asset"
        description="โอนย้ายระหว่างแผนก สถานที่ หรือพนักงาน / Transfer between department, location or employee"
      />
      <Card>
        <CardHeader>
          <CardTitle>แบบฟอร์มโอนย้าย / Transfer Form</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={transferAsset} className="space-y-4">
            <div className="space-y-1.5">
              <Label>ทรัพย์สิน / Asset *</Label>
              <Select name="assetId" required defaultValue={preselectedAssetId ?? ""}>
                <option value="" disabled>
                  — เลือกทรัพย์สิน / Select asset —
                </option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.assetTag} — {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              เลือกปลายทางอย่างน้อยหนึ่งรายการ / Select at least one transfer target.
            </p>
            <div className="space-y-1.5">
              <Label>ไปยังแผนก / To Department</Label>
              <Select name="toDepartmentId" defaultValue="">
                <option value="">— ไม่เปลี่ยน / No change —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ไปยังสถานที่ / To Location</Label>
              <Select name="toLocationId" defaultValue="">
                <option value="">— ไม่เปลี่ยน / No change —</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>ไปยังพนักงาน / To Employee</Label>
              <Select name="toEmployeeId" defaultValue="">
                <option value="">— ไม่เปลี่ยน / No change —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeCode} — {e.firstName} {e.lastName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>เหตุผล / Reason</Label>
              <Textarea name="reason" rows={3} />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit">โอนย้าย / Transfer</Button>
              <Button variant="outline" asChild>
                <Link href="/assets">ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
