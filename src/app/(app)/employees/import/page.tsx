import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmployeeImportUploader } from "./uploader";

const COLUMN_DOCS = [
  { name: "employeeCode", required: true, description: "รหัสพนักงาน (ห้ามซ้ำ; ใช้ซ้ำ = อัปเดต) / Employee code (unique; existing = update)" },
  { name: "firstName", required: true, description: "ชื่อ / First name" },
  { name: "lastName", required: true, description: "นามสกุล/ชื่อเล่น / Last name (or nickname)" },
  { name: "email", required: false, description: "อีเมล / Email" },
  { name: "phone", required: false, description: "เบอร์โทร / Phone" },
  { name: "position", required: false, description: "ตำแหน่ง / Position" },
  { name: "department", required: false, description: "ชื่อแผนก — สร้างให้อัตโนมัติถ้ายังไม่มี / Department name (auto-created if missing)" },
  { name: "location", required: false, description: "ชื่อสถานที่ — สร้างให้อัตโนมัติถ้ายังไม่มี / Location name (auto-created if missing)" },
  { name: "status", required: false, description: "ACTIVE, ON_LEAVE, OFFBOARDING, RESIGNED (ค่าเริ่มต้น ACTIVE)" },
  { name: "startDate", required: false, description: "วันเริ่มงาน YYYY-MM-DD / Start date" },
  { name: "endDate", required: false, description: "วันสิ้นสุด/ลาออก YYYY-MM-DD / End (resignation) date" },
];

export default async function EmployeeImportPage() {
  const user = await requireUser();
  if (!user.permissions.has("employee:create")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  return (
    <div>
      <PageHeader
        title="นำเข้าพนักงานจากไฟล์ / Import Employees"
        description="อัปโหลด CSV หรือ Excel (.xlsx) เพื่อสร้าง/อัปเดตพนักงานหลายคนพร้อมกัน — จับคู่ด้วยรหัสพนักงาน"
      >
        <Button variant="outline" asChild>
          <Link href="/employees">
            <ArrowLeft className="h-4 w-4" />
            กลับไปหน้าพนักงาน / Back to Employees
          </Link>
        </Button>
      </PageHeader>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>อัปโหลดไฟล์ / Upload File</CardTitle>
            <CardDescription>
              CSV (UTF-8) หรือ Excel (.xlsx — ใช้แผ่นงานแรก) ขนาดไม่เกิน 4MB สูงสุด 5,000 แถว —
              แถวแรกต้องเป็นหัวตาราง (ชื่อคอลัมน์ไม่สนตัวพิมพ์เล็ก-ใหญ่) แถวที่ไม่ผ่านจะถูกข้าม
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmployeeImportUploader />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รูปแบบไฟล์ / File Format</CardTitle>
            <CardDescription>
              จับคู่พนักงานด้วย employeeCode — ถ้ามีอยู่แล้วจะอัปเดต ถ้าไม่มีจะสร้างใหม่ ·
              แผนก/สถานที่จับคู่ด้วยชื่อและสร้างให้อัตโนมัติถ้ายังไม่มี
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>คอลัมน์ / Column</TableHead>
                  <TableHead>จำเป็น / Required</TableHead>
                  <TableHead>คำอธิบาย / Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {COLUMN_DOCS.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-mono text-xs">{c.name}</TableCell>
                    <TableCell>
                      {c.required ? (
                        <span className="font-medium text-destructive">จำเป็น / Required</span>
                      ) : (
                        <span className="text-muted-foreground">ไม่จำเป็น / Optional</span>
                      )}
                    </TableCell>
                    <TableCell>{c.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
