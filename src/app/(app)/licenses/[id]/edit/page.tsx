import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateLicense } from "../../actions";

const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditLicensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("license:manage")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const [license, vendors] = await Promise.all([
    prisma.license.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    }),
    prisma.vendor.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!license) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`แก้ไข / Edit: ${license.softwareName}`}
        description="แก้ไขข้อมูลลิขสิทธิ์ / Edit license details"
      />
      <Card>
        <CardContent className="p-5">
          <form action={updateLicense.bind(null, license.id)} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="softwareName">ชื่อซอฟต์แวร์ / Software name *</Label>
              <Input
                id="softwareName"
                name="softwareName"
                required
                maxLength={200}
                defaultValue={license.softwareName}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="vendorId">ผู้จำหน่าย / Vendor</Label>
              <Select id="vendorId" name="vendorId" className="mt-1" defaultValue={license.vendorId ?? ""}>
                <option value="">— ไม่ระบุ / None —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="licenseType">ประเภท / License type</Label>
              <Select
                id="licenseType"
                name="licenseType"
                className="mt-1"
                defaultValue={license.licenseType ?? ""}
              >
                <option value="">— ไม่ระบุ / None —</option>
                <option value="PERPETUAL">Perpetual</option>
                <option value="SUBSCRIPTION">Subscription</option>
                <option value="OEM">OEM</option>
                <option value="VOLUME">Volume</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="totalSeats">จำนวนที่นั่ง / Total seats *</Label>
              <Input
                id="totalSeats"
                name="totalSeats"
                type="number"
                min={1}
                required
                defaultValue={license.totalSeats}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="purchaseDate">วันที่ซื้อ / Purchase date</Label>
              <Input
                id="purchaseDate"
                name="purchaseDate"
                type="date"
                defaultValue={toDateInput(license.purchaseDate)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="startDate">วันที่เริ่มใช้ / Start date</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={toDateInput(license.startDate)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="expiresAt">วันหมดอายุ / Expires at</Label>
              <Input
                id="expiresAt"
                name="expiresAt"
                type="date"
                defaultValue={toDateInput(license.expiresAt)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cost">ราคา / Cost (฿)</Label>
              <Input
                id="cost"
                name="cost"
                type="number"
                step="0.01"
                min={0}
                defaultValue={license.cost !== null ? Number(license.cost) : ""}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="renewalCost">ค่าต่ออายุ / Renewal cost (฿)</Label>
              <Input
                id="renewalCost"
                name="renewalCost"
                type="number"
                step="0.01"
                min={0}
                defaultValue={license.renewalCost !== null ? Number(license.renewalCost) : ""}
                className="mt-1"
              />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id="autoRenewal"
                name="autoRenewal"
                type="checkbox"
                defaultChecked={license.autoRenewal}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="autoRenewal">ต่ออายุอัตโนมัติ / Auto-renewal</Label>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">หมายเหตุ / Notes</Label>
              <Textarea id="notes" name="notes" rows={3} defaultValue={license.notes ?? ""} className="mt-1" />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">บันทึก / Save</Button>
              <Button variant="outline" asChild>
                <Link href={`/licenses/${license.id}`}>ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
