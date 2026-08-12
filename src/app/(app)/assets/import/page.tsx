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
import { ImportUploader } from "./uploader";

interface ColumnDoc {
  name: string;
  required: boolean;
  description: string;
}

const COLUMN_DOCS: ColumnDoc[] = [
  { name: "assetTag", required: true, description: "รหัสทรัพย์สิน (ห้ามซ้ำ) / Asset tag (must be unique)" },
  { name: "name", required: true, description: "ชื่อทรัพย์สิน / Asset name" },
  { name: "serialNumber", required: false, description: "หมายเลขซีเรียล / Serial number" },
  { name: "brand", required: false, description: "ยี่ห้อ / Brand" },
  { name: "model", required: false, description: "รุ่น / Model" },
  { name: "specification", required: false, description: "สเปค / Specification" },
  { name: "category", required: false, description: "ชื่อหมวดหมู่ที่มีอยู่ในระบบ / Existing category name" },
  { name: "department", required: false, description: "รหัสแผนกที่มีอยู่ในระบบ / Existing department code" },
  { name: "location", required: false, description: "รหัสสถานที่ที่มีอยู่ในระบบ / Existing location code" },
  { name: "vendor", required: false, description: "ชื่อผู้ขายที่มีอยู่ในระบบ / Existing vendor name" },
  { name: "purchaseDate", required: false, description: "วันที่ซื้อ รูปแบบ YYYY-MM-DD / Purchase date (YYYY-MM-DD)" },
  { name: "purchasePrice", required: false, description: "ราคาซื้อ (ตัวเลข) / Purchase price (numeric)" },
  { name: "warrantyStart", required: false, description: "เริ่มประกัน รูปแบบ YYYY-MM-DD / Warranty start (YYYY-MM-DD)" },
  { name: "warrantyEnd", required: false, description: "สิ้นสุดประกัน รูปแบบ YYYY-MM-DD / Warranty end (YYYY-MM-DD)" },
  { name: "invoiceNumber", required: false, description: "เลขที่ใบแจ้งหนี้ / Invoice number" },
  {
    name: "condition",
    required: false,
    description: "สภาพ: NEW, GOOD, FAIR, DAMAGED, CRITICAL (ค่าเริ่มต้น GOOD) / Condition (default GOOD)",
  },
  {
    name: "status",
    required: false,
    description:
      "สถานะ: AVAILABLE, ASSIGNED, IN_USE, IN_REPAIR, LOST, STOLEN, DAMAGED, RETIRED, DISPOSED (ค่าเริ่มต้น AVAILABLE) / Status (default AVAILABLE)",
  },
  { name: "costCenter", required: false, description: "ศูนย์ต้นทุน / Cost center" },
  { name: "project", required: false, description: "โครงการ / Project" },
  { name: "ipAddress", required: false, description: "IP Address" },
  { name: "notes", required: false, description: "หมายเหตุ / Notes" },
];

export default async function AssetImportPage() {
  const user = await requireUser();
  if (!user.permissions.has("asset:create")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  return (
    <div>
      <PageHeader
        title="นำเข้าทรัพย์สินจากไฟล์ / Import Assets from File"
        description="อัปโหลดไฟล์ CSV หรือ Excel (.xlsx) เพื่อสร้างทรัพย์สินหลายรายการพร้อมกัน / Upload a CSV or Excel (.xlsx) file to create multiple assets at once"
      >
        <Button variant="outline" asChild>
          <Link href="/assets">
            <ArrowLeft className="h-4 w-4" />
            กลับไปหน้าทรัพย์สิน / Back to Assets
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <a href="/api/assets/import">
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
            <ImportUploader />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รูปแบบไฟล์ / File Format</CardTitle>
            <CardDescription>
              ใช้ได้ทั้ง CSV และ Excel (.xlsx — ใช้แผ่นงานแรก) แถวแรกต้องเป็นหัวตาราง
              (ชื่อคอลัมน์ไม่สนตัวพิมพ์เล็ก-ใหญ่) ค่า category / department / location / vendor
              ต้องมีอยู่ในระบบแล้ว — ระบบจะไม่สร้างให้อัตโนมัติ / Works with CSV and Excel (.xlsx —
              first worksheet is used). The first row must be a header (column names are
              case-insensitive). Category, department, location and vendor values must already
              exist — they are not auto-created.
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
