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
import { createTicket } from "../actions";

export default async function NewMaintenanceTicketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("maintenance:manage")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const [assets, employees, vendors] = await Promise.all([
    prisma.asset.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        status: { not: "DISPOSED" },
      },
      select: { id: true, assetTag: true, name: true },
      orderBy: { assetTag: "asc" },
    }),
    prisma.employee.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    prisma.vendor.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="แจ้งซ่อม / New Maintenance Ticket"
        description="เปิดใบแจ้งซ่อมทรัพย์สิน / Open a new maintenance ticket"
      />

      {sp.error === "asset" && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          ไม่พบทรัพย์สินที่เลือก / Selected asset not found or already disposed.
        </div>
      )}

      <Card>
        <CardContent className="p-5">
          <form action={createTicket} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="assetId">ทรัพย์สิน / Asset *</Label>
              <Select id="assetId" name="assetId" required className="mt-1" defaultValue="">
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
            <div className="sm:col-span-2">
              <Label htmlFor="problem">ปัญหา / Problem *</Label>
              <Textarea id="problem" name="problem" required rows={3} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="priority">ความสำคัญ / Priority *</Label>
              <Select id="priority" name="priority" required className="mt-1" defaultValue="MEDIUM">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="type">ประเภท / Type *</Label>
              <Select id="type" name="type" required className="mt-1" defaultValue="CORRECTIVE">
                <option value="CORRECTIVE">แก้ไข / Corrective (เสียแล้วซ่อม)</option>
                <option value="PREVENTIVE">เชิงป้องกัน / Preventive (ตามกำหนด)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="scheduledDate">วันที่กำหนด (Preventive) / Scheduled date</Label>
              <Input id="scheduledDate" name="scheduledDate" type="date" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="recurrenceDays">ทำซ้ำทุกกี่วัน / Repeat every (days)</Label>
              <Input id="recurrenceDays" name="recurrenceDays" type="number" min={1} max={3650} placeholder="เช่น 90, 180, 365" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="technicianId">ช่างผู้รับผิดชอบ / Technician</Label>
              <Select id="technicianId" name="technicianId" className="mt-1" defaultValue="">
                <option value="">— ไม่ระบุ / None —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} ({e.employeeCode})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="vendorId">ผู้จำหน่าย/ศูนย์ซ่อม / Vendor</Label>
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
              <Label htmlFor="remark">หมายเหตุ / Remark</Label>
              <Input id="remark" name="remark" maxLength={500} className="mt-1" />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">เปิดใบแจ้งซ่อม / Create Ticket</Button>
              <Button variant="outline" asChild>
                <Link href="/maintenance">ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
