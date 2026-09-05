import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { createEmployee } from "../actions";

const STATUS_OPTIONS = ["ACTIVE", "ON_LEAVE", "OFFBOARDING", "RESIGNED"] as const;

export default async function NewEmployeePage() {
  const user = await requirePermission("employee:create");

  const [departments, locations, managers] = await Promise.all([
    prisma.department.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
      orderBy: { firstName: "asc" },
    }),
  ]);

  // Free SIM/phone lines (not linked to any employee) available to assign.
  const availableSims = user.permissions.has("sim:read")
    ? await prisma.simCard.findMany({
        where: { organizationId: user.organizationId, deletedAt: null, employeeId: null, status: { in: ["ACTIVE", "UNUSED"] } },
        select: { id: true, phoneNumber: true, carrier: true },
        orderBy: [{ carrier: "asc" }, { phoneNumber: "asc" }],
        take: 1000,
      })
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="เพิ่มพนักงาน / New Employee" description="กรอกข้อมูลพนักงานใหม่ / Create a new employee record" />
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลพนักงาน / Employee Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createEmployee} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="employeeCode">รหัสพนักงาน / Employee Code *</Label>
              <Input id="employeeCode" name="employeeCode" required maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">สถานะ / Status</Label>
              <Select id="status" name="status" defaultValue="ACTIVE">
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="firstName">ชื่อ / First name *</Label>
              <Input id="firstName" name="firstName" required maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">นามสกุล / Last name *</Label>
              <Input id="lastName" name="lastName" required maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">อีเมล / Email</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">โทรศัพท์ / Phone</Label>
              <Input id="phone" name="phone" maxLength={50} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position">ตำแหน่ง / Position</Label>
              <Input id="position" name="position" maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="departmentId">แผนก / Department</Label>
              <Select id="departmentId" name="departmentId" defaultValue="">
                <option value="">- ไม่ระบุ / None -</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="locationId">สถานที่ / Location</Label>
              <Select id="locationId" name="locationId" defaultValue="">
                <option value="">- ไม่ระบุ / None -</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            {availableSims.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="simCardId">เบอร์/ซิม / SIM &amp; Phone Line</Label>
                <Select id="simCardId" name="simCardId" defaultValue="">
                  <option value="">- ไม่ผูก / None -</option>
                  {availableSims.map((s) => (
                    <option key={s.id} value={s.id}>{s.phoneNumber} ({s.carrier})</option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">แสดงเฉพาะเบอร์ที่ยังว่าง / Only unassigned lines</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="managerId">หัวหน้า / Manager</Label>
              <Select id="managerId" name="managerId" defaultValue="">
                <option value="">- ไม่ระบุ / None -</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName} ({m.employeeCode})
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="startDate">วันเริ่มงาน / Start date</Label>
              <Input id="startDate" name="startDate" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">วันสิ้นสุด / End date</Label>
              <Input id="endDate" name="endDate" type="date" />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">บันทึก / Save</Button>
              <Button variant="outline" asChild>
                <Link href="/employees">ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
