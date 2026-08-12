import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSubscription } from "../actions";

export default async function NewSubscriptionPage() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("subscription:manage")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const vendors = await prisma.vendor.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="เพิ่มบริการ / New Subscription"
        description="ลงทะเบียนบริการแบบสมัครสมาชิกใหม่ / Register a new subscription"
      />
      <Card>
        <CardContent className="p-5">
          <form action={createSubscription} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="serviceName">ชื่อบริการ / Service name *</Label>
              <Input id="serviceName" name="serviceName" required maxLength={200} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="vendorId">ผู้ให้บริการ / Vendor</Label>
              <Select id="vendorId" name="vendorId" className="mt-1" defaultValue="">
                <option value="">— ไม่ระบุ / None —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="plan">แผน / Plan</Label>
              <Input id="plan" name="plan" maxLength={200} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="quantity">จำนวน / Quantity *</Label>
              <Input id="quantity" name="quantity" type="number" min={1} defaultValue={1} required className="mt-1" />
            </div>
            <div>
              <Label htmlFor="cost">ค่าบริการ / Cost (฿)</Label>
              <Input id="cost" name="cost" type="number" step="0.01" min={0} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="billingCycle">รอบบิล / Billing cycle</Label>
              <Select id="billingCycle" name="billingCycle" className="mt-1" defaultValue="">
                <option value="">— ไม่ระบุ / None —</option>
                <option value="MONTHLY">รายเดือน / Monthly</option>
                <option value="YEARLY">รายปี / Yearly</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="startDate">วันที่เริ่ม / Start date</Label>
              <Input id="startDate" name="startDate" type="date" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="renewalDate">วันต่ออายุ / Renewal date</Label>
              <Input id="renewalDate" name="renewalDate" type="date" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="status">สถานะ / Status *</Label>
              <Select id="status" name="status" required className="mt-1" defaultValue="ACTIVE">
                <option value="ACTIVE">Active</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="EXPIRED">Expired</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">หมายเหตุ / Notes</Label>
              <Textarea id="notes" name="notes" rows={3} className="mt-1" />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">บันทึก / Save</Button>
              <Button variant="outline" asChild>
                <Link href="/subscriptions">ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
