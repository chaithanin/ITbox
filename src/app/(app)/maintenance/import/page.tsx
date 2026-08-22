import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MaintenanceImportUploader } from "./uploader";

interface ColumnDoc {
  name: string;
  required: boolean;
  description: string;
}

const COLUMN_DOCS: ColumnDoc[] = [
  { name: "assetTag", required: false, description: "รหัสทรัพย์สินที่มีอยู่ (จับคู่แบบตรงตัว) / Existing asset tag (exact match)" },
  { name: "assetName", required: false, description: "ชื่ออุปกรณ์ — ใช้เมื่อไม่มี assetTag จับคู่ด้วยชื่อ ถ้าไม่พบจะสร้างทรัพย์สินขั้นต่ำให้อัตโนมัติ / Device name — matched by name; a minimal asset is auto-created if not found" },
  { name: "problem", required: true, description: "อาการ/ปัญหา / Problem reported" },
  { name: "solution", required: false, description: "วิธีแก้ไข → เก็บเป็น diagnosis / Solution → stored as diagnosis" },
  { name: "priority", required: false, description: "LOW, MEDIUM, HIGH, URGENT (ค่าเริ่มต้น MEDIUM)" },
  { name: "status", required: false, description: "OPEN, IN_PROGRESS, WAITING_PART, WAITING_VENDOR, COMPLETED, CANCELLED — ถ้าเว้นว่าง: มีวันที่เสร็จ→COMPLETED ไม่งั้น→OPEN" },
  { name: "technicianName", required: false, description: "ชื่อช่าง — จับคู่กับพนักงาน ถ้าไม่พบจะเก็บชื่อไว้ในหมายเหตุ / Technician name — matched to an employee, else kept in remark" },
  { name: "vendor", required: false, description: "ชื่อผู้ขายที่มีอยู่ในระบบ (ไม่พบจะเว้นว่าง) / Existing vendor name (ignored if not found)" },
  { name: "requestBy", required: false, description: "ผู้แจ้ง (ข้อความ) — เก็บในหมายเหตุ / Requester (free text) — stored in remark" },
  { name: "userName", required: false, description: "ผู้ใช้อุปกรณ์ (ข้อความ) — เก็บในหมายเหตุ / Device user (free text) — stored in remark" },
  { name: "startedAt", required: false, description: "วันเริ่มซ่อม รูปแบบ YYYY-MM-DD / Start date (YYYY-MM-DD)" },
  { name: "completedAt", required: false, description: "วันซ่อมเสร็จ รูปแบบ YYYY-MM-DD / Finish date (YYYY-MM-DD)" },
  { name: "repairCost", required: false, description: "ค่าใช้จ่าย (ตัวเลข) / Repair cost (numeric)" },
  { name: "remark", required: false, description: "หมายเหตุ / Remark" },
];

export default async function MaintenanceImportPage() {
  const user = await requireUser();
  if (!user.permissions.has("maintenance:manage")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  return (
    <div>
      <PageHeader
        title="นำเข้างานแจ้งซ่อมจากไฟล์ / Import Maintenance from File"
        description="อัปโหลดไฟล์ CSV หรือ Excel (.xlsx) เพื่อสร้างประวัติงานซ่อมหลายรายการพร้อมกัน / Upload a CSV or Excel (.xlsx) file to create maintenance tickets in bulk"
      >
        <Button variant="outline" asChild>
          <Link href="/maintenance">
            <ArrowLeft className="h-4 w-4" />
            กลับไปหน้างานซ่อม / Back to Maintenance
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <a href="/api/maintenance/import">
            <Download className="h-4 w-4" />
            ดาวน์โหลดเทมเพลต / Download template
          </a>
        </Button>
      </PageHeader>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>อัปโหลดไฟล์ / Upload File</CardTitle>
            <CardDescription>
              ไฟล์ CSV หรือ Excel (.xlsx) ขนาดไม่เกิน 2MB สูงสุด 2,000 แถว —
              แถวที่ไม่ผ่านการตรวจสอบจะถูกข้าม / CSV (UTF-8) or Excel (.xlsx) file, max 2MB and
              2,000 rows — rows that fail validation are skipped.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MaintenanceImportUploader />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รูปแบบไฟล์ / File Format</CardTitle>
            <CardDescription>
              ใช้ได้ทั้ง CSV และ Excel (.xlsx — ใช้แผ่นงานแรก) แถวแรกต้องเป็นหัวตาราง
              (ชื่อคอลัมน์ไม่สนตัวพิมพ์เล็ก-ใหญ่) · ต้องมี problem และอย่างน้อย assetTag หรือ assetName ·
              งานซ่อมที่ปิดแล้ว (COMPLETED/CANCELLED) จะไม่เปลี่ยนสถานะทรัพย์สิน ส่วนงานที่ยังเปิดอยู่จะตั้งทรัพย์สินเป็น IN_REPAIR /
              CSV or Excel (.xlsx, first sheet). First row is the header (case-insensitive). Must
              include problem plus at least one of assetTag or assetName. Closed tickets do not
              change the asset status; open tickets set the asset to IN_REPAIR.
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
