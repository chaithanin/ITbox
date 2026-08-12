import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createPurchaseRequest } from "../actions";

const MAX_ITEMS = 5;

export default async function NewPurchaseRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("procurement:create")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const [departments, vendors] = await Promise.all([
    prisma.department.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.vendor.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="สร้างคำขอจัดซื้อ / New Purchase Request"
        description="ส่งคำขอเข้าสู่ขั้นตอนอนุมัติ 3 ขั้น (ผู้จัดการ → ไอที → การเงิน) / Submits into the 3-step approval flow (Manager → IT → Finance)"
      />

      {sp.error === "items" && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          กรุณาระบุรายการอย่างน้อย 1 รายการ / Please enter at least one item.
        </div>
      )}

      <form action={createPurchaseRequest} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลคำขอ / Request info</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="reason">เหตุผลการขอซื้อ / Reason *</Label>
              <Textarea id="reason" name="reason" required rows={3} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="departmentId">แผนก / Department</Label>
              <Select id="departmentId" name="departmentId" className="mt-1" defaultValue="">
                <option value="">— ไม่ระบุ / None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.code})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="vendorId">ผู้จำหน่าย / Vendor</Label>
              <Select id="vendorId" name="vendorId" className="mt-1" defaultValue="">
                <option value="">— ไม่ระบุ / None —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รายการ / Items (สูงสุด {MAX_ITEMS} รายการ / max {MAX_ITEMS})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: MAX_ITEMS }).map((_, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_7rem_10rem]">
                <div>
                  {i === 0 && (
                    <Label htmlFor={`item${i}_desc`} className="mb-1 block">
                      รายละเอียด / Description
                    </Label>
                  )}
                  <Input
                    id={`item${i}_desc`}
                    name={`item${i}_desc`}
                    maxLength={1000}
                    placeholder={`รายการที่ ${i + 1} / Item ${i + 1}`}
                    required={i === 0}
                  />
                </div>
                <div>
                  {i === 0 && (
                    <Label htmlFor={`item${i}_qty`} className="mb-1 block">
                      จำนวน / Qty
                    </Label>
                  )}
                  <Input
                    id={`item${i}_qty`}
                    name={`item${i}_qty`}
                    type="number"
                    min={1}
                    defaultValue={1}
                  />
                </div>
                <div>
                  {i === 0 && (
                    <Label htmlFor={`item${i}_cost`} className="mb-1 block">
                      ราคาประมาณ/หน่วย / Est. cost (฿)
                    </Label>
                  )}
                  <Input
                    id={`item${i}_cost`}
                    name={`item${i}_cost`}
                    type="number"
                    step="0.01"
                    min={0}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit">ส่งคำขอ / Submit Request</Button>
          <Button variant="outline" asChild>
            <Link href="/procurement">ยกเลิก / Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
