import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { EmployeeCombobox } from "@/components/employee-combobox";
import { createDriveMapping } from "../actions";

export default async function NewDriveMappingPage() {
  const user = await requirePermission("support:work");
  const rows = await prisma.employee.findMany({
    where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
    orderBy: [{ firstName: "asc" }],
    take: 2000,
  });
  const employees = rows.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim(), code: e.employeeCode }));
  const canVault = user.permissions.has("vault:create");

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/drive-mappings"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="สร้างการตั้งค่าไดรฟ์และผู้ใช้ / New Drive & User Setup" description="ข้อมูลเครื่อง/ผู้ใช้ + ไดรฟ์ที่ต้อง map (รหัสผ่านเก็บใน Vault)" />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">ข้อมูลการตั้งค่า / Setup details</CardTitle></CardHeader>
        <CardContent>
          <form action={createDriveMapping} className="space-y-4">
            <div className="space-y-1.5">
              <Label>พนักงาน / Employee</Label>
              <EmployeeCombobox employees={employees} />
              <p className="text-xs text-muted-foreground">เลือกเพื่อดึงชื่อ/รหัส/ตำแหน่งอัตโนมัติ หรือกรอกเองด้านล่าง</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="employeeName">ชื่อ / Name</Label><Input id="employeeName" name="employeeName" placeholder="MS CHANANCHIDA KOTTHA" /></div>
              <div className="space-y-1.5"><Label htmlFor="nickname">ชื่อเล่น / Nickname</Label><Input id="nickname" name="nickname" placeholder="K.PAERY" /></div>
              <div className="space-y-1.5"><Label htmlFor="employeeCode">รหัสพนักงาน / Staff ID</Label><Input id="employeeCode" name="employeeCode" placeholder="10814" /></div>
              <div className="space-y-1.5"><Label htmlFor="position">ตำแหน่ง / Position</Label><Input id="position" name="position" placeholder="SALES TRAINER" /></div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="computerName">Computer and User name</Label><Input id="computerName" name="computerName" placeholder="Sales-Trainer" /></div>
              <div className="space-y-1.5"><Label htmlFor="userShare">User Share</Label><Input id="userShare" name="userShare" placeholder="salestrainer" /></div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="loginUsername">Login user name</Label><Input id="loginUsername" name="loginUsername" placeholder="เว้นว่าง = ใช้ค่า Computer and User name" /></div>
              <div className="space-y-1.5">
                <Label htmlFor="password">รหัสผ่าน / Password {canVault ? "" : "(ต้องมีสิทธิ์ Vault)"}</Label>
                <Input id="password" name="password" type="password" autoComplete="new-password" disabled={!canVault} placeholder="เก็บเข้ารหัสใน Vault" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="drives">Drive (1 บรรทัดต่อ 1 พาธ)</Label>
              <Textarea id="drives" name="drives" rows={6} className="font-mono text-xs" placeholder={"\\\\192.168.2.7\\2.Sales Department\\Project Information\n\\\\192.168.2.7\\2.Sales Department\\Paery-Sales Trainer"} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">หมายเหตุ / Notes</Label>
              <Input id="notes" name="notes" placeholder="เช่น เพิ่มเติมจากเดิม" />
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" asChild><Link href="/drive-mappings">ยกเลิก / Cancel</Link></Button>
              <Button type="submit">สร้าง / Create</Button>
            </div>
            <p className="text-xs text-muted-foreground">รหัสผ่านจะถูกเก็บเข้ารหัสใน Vault (AES-256-GCM + KMS) เท่านั้น ไม่บันทึกเป็น plaintext</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
