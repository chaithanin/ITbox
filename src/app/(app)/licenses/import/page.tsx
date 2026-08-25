import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LicenseImportUploader } from "./uploader";

const COLUMN_DOCS = [
  { name: "softwareName", required: true, description: "ชื่อซอฟต์แวร์ / Software name" },
  { name: "licenseType", required: false, description: "PERPETUAL, SUBSCRIPTION, OEM, VOLUME" },
  { name: "totalSeats", required: false, description: "จำนวนที่นั่ง/สิทธิ์ (ค่าเริ่มต้น 1) / Number of seats (default 1)" },
  { name: "vendor", required: false, description: "ชื่อผู้ขายที่มีอยู่ในระบบ (ไม่พบจะเว้นว่าง) / Existing vendor name" },
  { name: "purchaseDate", required: false, description: "วันที่ซื้อ YYYY-MM-DD" },
  { name: "startDate", required: false, description: "วันเริ่ม YYYY-MM-DD" },
  { name: "expiresAt", required: false, description: "วันหมดอายุ YYYY-MM-DD / Expiry date" },
  { name: "cost", required: false, description: "ราคา (ตัวเลข) / Cost (numeric)" },
  { name: "notes", required: false, description: "หมายเหตุ / Notes" },
];

export default async function LicenseImportPage() {
  const user = await requireUser();
  if (!user.permissions.has("license:manage")) {
    return <p className="text-sm text-muted-foreground">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.</p>;
  }

  return (
    <div>
      <PageHeader
        title="นำเข้าลิขสิทธิ์จากไฟล์ / Import Licenses from File"
        description="อัปโหลดไฟล์ CSV หรือ Excel (.xlsx) เพื่อสร้างลิขสิทธิ์ซอฟต์แวร์หลายรายการพร้อมกัน"
      >
        <Button variant="outline" asChild>
          <Link href="/licenses"><ArrowLeft className="h-4 w-4" /> กลับไปหน้าลิขสิทธิ์ / Back</Link>
        </Button>
        <Button variant="outline" asChild>
          <a href="/api/licenses/import"><Download className="h-4 w-4" /> ดาวน์โหลดเทมเพลต / Template</a>
        </Button>
      </PageHeader>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>อัปโหลดไฟล์ / Upload File</CardTitle>
            <CardDescription>
              ไฟล์ CSV หรือ Excel (.xlsx) ขนาดไม่เกิน 2MB — แถวที่ไม่ผ่านการตรวจสอบจะถูกข้าม /
              CSV or Excel file, max 2MB — invalid rows are skipped.
            </CardDescription>
          </CardHeader>
          <CardContent><LicenseImportUploader /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รูปแบบไฟล์ / File Format</CardTitle>
            <CardDescription>
              ใช้ได้ทั้ง CSV และ Excel (.xlsx — ใช้แผ่นงานแรก) แถวแรกต้องเป็นหัวตาราง · ต้องมี softwareName ·
              1 แถว = 1 ลิขสิทธิ์ (ระบุจำนวนที่นั่งใน totalSeats) · vendor จับคู่ด้วยชื่อที่มีอยู่แล้ว /
              First row is the header. Must include softwareName. One row = one license (seats in totalSeats).
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
                      {c.required
                        ? <span className="font-medium text-destructive">จำเป็น / Required</span>
                        : <span className="text-muted-foreground">ไม่จำเป็น / Optional</span>}
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
