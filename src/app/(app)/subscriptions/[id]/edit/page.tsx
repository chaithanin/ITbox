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
import { ConfirmButton } from "@/components/confirm-button";
import { updateSubscription, deleteSubscription } from "../../actions";

const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditSubscriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("subscription:manage")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const [sub, vendors] = await Promise.all([
    prisma.subscription.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    }),
    prisma.vendor.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!sub) notFound();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`แก้ไข / Edit: ${sub.serviceName}`}
        description="แก้ไขข้อมูลบริการ / Edit subscription details"
      >
        <form action={deleteSubscription.bind(null, sub.id)}>
          <ConfirmButton variant="destructive" confirmText="ลบบริการนี้? / Delete this subscription?">
            ลบ / Delete
          </ConfirmButton>
        </form>
      </PageHeader>
      <Card>
        <CardContent className="p-5">
          <form action={updateSubscription.bind(null, sub.id)} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="serviceName">ชื่อบริการ / Service name *</Label>
              <Input
                id="serviceName"
                name="serviceName"
                required
                maxLength={200}
                defaultValue={sub.serviceName}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="vendorId">ผู้ให้บริการ / Vendor</Label>
              <Select id="vendorId" name="vendorId" className="mt-1" defaultValue={sub.vendorId ?? ""}>
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
              <Input id="plan" name="plan" maxLength={200} defaultValue={sub.plan ?? ""} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="quantity">จำนวน / Quantity *</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={1}
                required
                defaultValue={sub.quantity}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="cost">ค่าบริการ / Cost (฿)</Label>
              <Input
                id="cost"
                name="cost"
                type="number"
                step="0.01"
                min={0}
                defaultValue={sub.cost !== null ? Number(sub.cost) : ""}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="billingCycle">รอบบิล / Billing cycle</Label>
              <Select
                id="billingCycle"
                name="billingCycle"
                className="mt-1"
                defaultValue={sub.billingCycle ?? ""}
              >
                <option value="">— ไม่ระบุ / None —</option>
                <option value="MONTHLY">รายเดือน / Monthly</option>
                <option value="YEARLY">รายปี / Yearly</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="startDate">วันที่เริ่ม / Start date</Label>
              <Input
                id="startDate"
                name="startDate"
                type="date"
                defaultValue={toDateInput(sub.startDate)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="renewalDate">วันต่ออายุ / Renewal date</Label>
              <Input
                id="renewalDate"
                name="renewalDate"
                type="date"
                defaultValue={toDateInput(sub.renewalDate)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="status">สถานะ / Status *</Label>
              <Select id="status" name="status" required className="mt-1" defaultValue={sub.status}>
                <option value="ACTIVE">Active</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="EXPIRED">Expired</option>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">หมายเหตุ / Notes</Label>
              <Textarea id="notes" name="notes" rows={3} defaultValue={sub.notes ?? ""} className="mt-1" />
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
