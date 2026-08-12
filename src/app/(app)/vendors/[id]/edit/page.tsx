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
import { updateVendor } from "../../actions";

export default async function EditVendorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("vendor:manage")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const vendor = await prisma.vendor.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!vendor) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`แก้ไข / Edit: ${vendor.name}`}
        description="แก้ไขข้อมูลผู้จำหน่าย / Edit vendor details"
      />
      <Card>
        <CardContent className="p-5">
          <form action={updateVendor.bind(null, vendor.id)} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">ชื่อผู้จำหน่าย / Vendor name *</Label>
              <Input id="name" name="name" required maxLength={200} defaultValue={vendor.name} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="contactName">ผู้ติดต่อ / Contact name</Label>
              <Input
                id="contactName"
                name="contactName"
                maxLength={200}
                defaultValue={vendor.contactName ?? ""}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="phone">โทรศัพท์ / Phone</Label>
              <Input id="phone" name="phone" maxLength={50} defaultValue={vendor.phone ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="email">อีเมล / Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                maxLength={320}
                defaultValue={vendor.email ?? ""}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="taxId">เลขผู้เสียภาษี / Tax ID</Label>
              <Input id="taxId" name="taxId" maxLength={50} defaultValue={vendor.taxId ?? ""} className="mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="address">ที่อยู่ / Address</Label>
              <Textarea id="address" name="address" rows={2} defaultValue={vendor.address ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="category">หมวดหมู่ / Category</Label>
              <Input
                id="category"
                name="category"
                maxLength={100}
                defaultValue={vendor.category ?? ""}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="rating">คะแนน / Rating</Label>
              <Select id="rating" name="rating" className="mt-1" defaultValue={vendor.rating?.toString() ?? ""}>
                <option value="">— ไม่ระบุ / None —</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {"★".repeat(n)} ({n})
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">หมายเหตุ / Notes</Label>
              <Textarea id="notes" name="notes" rows={3} defaultValue={vendor.notes ?? ""} className="mt-1" />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">บันทึก / Save</Button>
              <Button variant="outline" asChild>
                <Link href={`/vendors/${vendor.id}`}>ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
