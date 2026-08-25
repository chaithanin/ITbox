import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ItHealthImportUploader } from "./uploader";

const COLUMN_DOCS = [
  { name: "checkDate", required: false, description: "วันที่ตรวจ YYYY-MM-DD (เว้นว่าง = วันนี้) / Check date (default today)" },
  { name: "category", required: true, description: "SERVER, BACKUP, STORAGE, CCTV, PHONE, GPS, LOG, MANGO_LOGIN, MANGO_USAGE, OTHER" },
  { name: "name", required: true, description: "ชื่อรายการ เช่น Monday Server, Paradise DVR1 / Item name" },
  { name: "location", required: false, description: "ชื่อสถานที่ที่มีอยู่ในระบบ / Existing location name" },
  { name: "mode", required: false, description: "AUTO / CHECK_REQUIRED / ISSUE (ค่าเริ่มต้น CHECK_REQUIRED)" },
  { name: "status", required: false, description: "NORMAL, WARNING, CRITICAL, NOT_CHECKED (ค่าเริ่มต้น NOT_CHECKED)" },
  { name: "healthPercent", required: false, description: "0–100 เช่น CPU/Storage %" },
  { name: "note", required: false, description: "หมายเหตุ เช่น 16 cameras offline" },
  { name: "online", required: false, description: "เฉพาะ CCTV: Online / Offline (Connectivity)" },
  { name: "recording", required: false, description: "เฉพาะ CCTV: OK / Missing / Cannot Verify (Recording)" },
  { name: "lastRecording", required: false, description: "เฉพาะ CCTV: วันบันทึกล่าสุด / Last recording date" },
];

export default async function ItHealthImportPage() {
  const user = await requireUser();
  if (!user.permissions.has("support:work")) {
    return <p className="text-sm text-muted-foreground">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access.</p>;
  }
  return (
    <div>
      <PageHeader
        title="นำเข้าผลตรวจ IT Health / Import IT Health Checks"
        description="อัปโหลดชุดรายงานรายวัน (Server / Backup / Storage / CCTV / Phone / GPS / Log / Mango) เข้าระบบทีเดียว — upsert ตามวันที่+หมวด+ชื่อ"
      >
        <Button variant="outline" asChild>
          <Link href="/it-report"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link>
        </Button>
        <Button variant="outline" asChild>
          <a href="/api/it-report/import"><Download className="h-4 w-4" /> เทมเพลต / Template</a>
        </Button>
      </PageHeader>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>อัปโหลดไฟล์ / Upload File</CardTitle>
            <CardDescription>ไฟล์ CSV หรือ Excel (.xlsx) ขนาดไม่เกิน 2MB — นำเข้าซ้ำได้ (จะอัปเดตรายการเดิมของวันเดียวกัน)</CardDescription>
          </CardHeader>
          <CardContent><ItHealthImportUploader /></CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รูปแบบไฟล์ / File Format</CardTitle>
            <CardDescription>แถวแรกเป็นหัวตาราง · ต้องมี category และ name · CCTV ใช้ online + recording แยกสถานะการเชื่อมต่อและการบันทึก</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>คอลัมน์ / Column</TableHead><TableHead>จำเป็น</TableHead><TableHead>คำอธิบาย</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {COLUMN_DOCS.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-mono text-xs">{c.name}</TableCell>
                    <TableCell>{c.required ? <span className="font-medium text-destructive">จำเป็น</span> : <span className="text-muted-foreground">ไม่จำเป็น</span>}</TableCell>
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
