import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { assignAsset } from "../actions";
import { ASSET_CONDITIONS } from "../asset-form-fields";

export default async function AssignAssetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("asset:assign")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  const sp = await searchParams;
  const preselectedAssetId = sp.assetId?.trim() || undefined;

  const [assets, employees] = await Promise.all([
    prisma.asset.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, status: "AVAILABLE" },
      orderBy: { assetTag: "asc" },
      select: { id: true, assetTag: true, name: true },
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
        title="มอบหมายทรัพย์สิน / Assign Asset"
        description="เบิกจ่ายทรัพย์สินให้พนักงาน / Check out an asset to an employee"
      />
      <Card>
        <CardHeader>
          <CardTitle>แบบฟอร์มมอบหมาย / Check-out Form</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={assignAsset} className="space-y-4">
            <div className="space-y-1.5">
              <Label>ทรัพย์สิน / Asset (เฉพาะที่ว่าง / available only) *</Label>
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
            <div className="space-y-1.5">
              <Label>พนักงาน / Employee *</Label>
              <Select name="employeeId" required defaultValue="">
                <option value="" disabled>
                  — เลือกพนักงาน / Select employee —
                </option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employeeCode} — {e.firstName} {e.lastName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>วัตถุประสงค์ / Purpose</Label>
              <Input name="purpose" placeholder="เช่น ใช้งานประจำตำแหน่ง / e.g. daily work" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>กำหนดคืน / Expected Return Date</Label>
                <Input name="expectedReturnDate" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label>สภาพก่อนมอบหมาย / Condition Before</Label>
                <Select name="conditionBefore" defaultValue="">
                  <option value="">— ไม่ระบุ / Not specified —</option>
                  {ASSET_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ / Remark</Label>
              <Textarea name="remark" rows={3} />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit">มอบหมาย / Assign</Button>
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
