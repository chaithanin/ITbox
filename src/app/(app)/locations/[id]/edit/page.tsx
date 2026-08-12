import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateLocation } from "../../actions";

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("location:manage");
  const { id } = await params;

  const location = await prisma.location.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!location) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="แก้ไขสถานที่ / Edit Location" description={`${location.code} — ${location.name}`} />
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลสถานที่ / Location Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateLocation} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={location.id} />
            <div className="space-y-1.5">
              <Label htmlFor="code">รหัส / Code *</Label>
              <Input id="code" name="code" required maxLength={50} defaultValue={location.code} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">ชื่อ / Name *</Label>
              <Input id="name" name="name" required maxLength={200} defaultValue={location.name} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">ที่อยู่ / Address</Label>
              <Input id="address" name="address" maxLength={500} defaultValue={location.address ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="building">อาคาร / Building</Label>
              <Input id="building" name="building" maxLength={200} defaultValue={location.building ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="floor">ชั้น / Floor</Label>
              <Input id="floor" name="floor" maxLength={50} defaultValue={location.floor ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room">ห้อง / Room</Label>
              <Input id="room" name="room" maxLength={50} defaultValue={location.room ?? ""} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">บันทึก / Save</Button>
              <Button variant="outline" asChild>
                <Link href="/locations">ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
