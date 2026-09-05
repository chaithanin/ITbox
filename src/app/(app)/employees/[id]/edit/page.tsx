import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { updateEmployee } from "../../actions";

const STATUS_OPTIONS = ["ACTIVE", "ON_LEAVE", "OFFBOARDING", "RESIGNED"] as const;

const dateValue = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("employee:update");
  const { id } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!employee) notFound();

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
      where: { organizationId: user.organizationId, deletedAt: null, NOT: { id } },
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
      orderBy: { firstName: "asc" },
    }),
  ]);

  // SIM lines: free ones + any already linked to this employee (so it shows selected).
  const sims = user.permissions.has("sim:read")
    ? await prisma.simCard.findMany({
        where: { organizationId: user.organizationId, deletedAt: null, OR: [{ employeeId: null, status: { in: ["ACTIVE", "UNUSED"] } }, { employeeId: id }] },
        select: { id: true, phoneNumber: true, carrier: true, employeeId: true },
        orderBy: [{ carrier: "asc" }, { phoneNumber: "asc" }],
        take: 1000,
      })
    : [];
  const linkedSimId = sims.find((s) => s.employeeId === id)?.id ?? "";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`แก้ไข / Edit: ${employee.firstName} ${employee.lastName}`}
        description={employee.employeeCode}
      />
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลพนักงาน / Employee Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateEmployee} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={employee.id} />
            <div className="space-y-1.5">
              <Label htmlFor="employeeCode">รหัสพนักงาน / Employee Code *</Label>
              <Input id="employeeCode" name="employeeCode" required maxLength={50} defaultValue={employee.employeeCode} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">สถานะ / Status</Label>
              <Select id="status" name="status" defaultValue={employee.status}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="firstName">ชื่อ / First name *</Label>
              <Input id="firstName" name="firstName" required maxLength={100} defaultValue={employee.firstName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">นามสกุล / Last name *</Label>
              <Input id="lastName" name="lastName" required maxLength={100} defaultValue={employee.lastName} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">อีเมล / Email</Label>
              <Input id="email" name="email" type="email" defaultValue={employee.email ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">โทรศัพท์ / Phone</Label>
              <Input id="phone" name="phone" maxLength={50} defaultValue={employee.phone ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="position">ตำแหน่ง / Position</Label>
              <Input id="position" name="position" maxLength={200} defaultValue={employee.position ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="departmentId">แผนก / Department</Label>
              <Select id="departmentId" name="departmentId" defaultValue={employee.departmentId ?? ""}>
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
              <Select id="locationId" name="locationId" defaultValue={employee.locationId ?? ""}>
                <option value="">- ไม่ระบุ / None -</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            {sims.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="simCardId">เบอร์/ซิม / SIM &amp; Phone Line</Label>
                <Select id="simCardId" name="simCardId" defaultValue={linkedSimId}>
                  <option value="">- ไม่ผูก / None -</option>
                  {sims.map((s) => (
                    <option key={s.id} value={s.id}>{s.phoneNumber} ({s.carrier}){s.employeeId === id ? " · ปัจจุบัน" : ""}</option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">แสดงเบอร์ที่ยังว่าง + เบอร์ที่ผูกกับพนักงานคนนี้อยู่</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="managerId">หัวหน้า / Manager</Label>
              <Select id="managerId" name="managerId" defaultValue={employee.managerId ?? ""}>
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
              <Input id="startDate" name="startDate" type="date" defaultValue={dateValue(employee.startDate)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">วันสิ้นสุด / End date</Label>
              <Input id="endDate" name="endDate" type="date" defaultValue={dateValue(employee.endDate)} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">บันทึก / Save</Button>
              <Button variant="outline" asChild>
                <Link href={`/employees/${employee.id}`}>ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
