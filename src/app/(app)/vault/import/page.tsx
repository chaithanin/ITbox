import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck } from "lucide-react";
import { VaultImportUploader } from "./uploader";

export const dynamic = "force-dynamic";

const COLUMN_DOCS: { col: string; req: boolean; desc: string }[] = [
  { col: "name", req: true, desc: "ชื่อรายการ / Secret name" },
  { col: "category", req: false, desc: "หมวดหมู่ (สร้างอัตโนมัติถ้ายังไม่มี) เช่น Server, Network, WiFi, CCTV, OTA, Social, Email" },
  { col: "type", req: false, desc: "PASSWORD/SERVER/DATABASE/API_KEY/SSH_KEY/WIFI/NETWORK_DEVICE/CERTIFICATE/LICENSE_KEY/TOKEN/OTHER (ค่าเริ่มต้น PASSWORD)" },
  { col: "classification", req: false, desc: "LOW/MEDIUM/HIGH/CRITICAL (ค่าเริ่มต้น MEDIUM; HIGH/CRITICAL บังคับ MFA ตอนเปิดเผย)" },
  { col: "environment", req: false, desc: "Production / Staging / Development" },
  { col: "username", req: false, desc: "ชื่อผู้ใช้ (ค้นหาได้ ไม่ถือเป็นความลับ)" },
  { col: "url", req: false, desc: "ลิงก์เข้าใช้งาน" },
  { col: "host", req: false, desc: "Host / IP" },
  { col: "port", req: false, desc: "พอร์ต (ตัวเลข)" },
  { col: "protocol", req: false, desc: "SSH / RDP / HTTPS ..." },
  { col: "tags", req: false, desc: "แท็ก คั่นด้วย , " },
  { col: "notes", req: false, desc: "หมายเหตุ" },
  { col: "password", req: false, desc: "รหัสผ่าน (เข้ารหัสฝั่งเซิร์ฟเวอร์)" },
  { col: "apiKey / token / sshPrivateKey / sshPublicKey / certificate", req: false, desc: "ข้อมูลลับอื่น ๆ (ต้องมีอย่างน้อยหนึ่งอย่างต่อแถว)" },
];

export default async function VaultImportPage() {
  const user = await requirePermission("vault:read");
  if (!user.permissions.has("vault:manage")) {
    return (
      <p className="text-sm text-muted-foreground">
        เฉพาะผู้ดูแล Vault (vault:manage) เท่านั้นที่นำเข้าจำนวนมากได้ /
        Bulk import requires the vault:manage permission.
      </p>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="นำเข้ารหัสผ่านจำนวนมาก / Bulk Import Secrets"
        description="รองรับไฟล์ CSV และ Excel (.xlsx) — ทุกข้อมูลลับถูกเข้ารหัส AES-256-GCM + Cloud KMS ฝั่งเซิร์ฟเวอร์ และบันทึก Audit"
      />

      <Card className="mb-4 border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 p-4 text-sm">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1">
            <p className="font-medium">ความปลอดภัย / Security</p>
            <p className="text-muted-foreground">
              ค่ารหัสผ่านจะถูกเข้ารหัสทันทีที่เซิร์ฟเวอร์ ไม่ถูกบันทึกเป็น plaintext
              และไม่มีฟังก์ชัน export ค่ารหัสผ่านกลับ — ควรลบไฟล์ต้นฉบับหลังนำเข้าเสร็จ
              และเปลี่ยนหมวด/ระดับความลับได้ภายหลังในแต่ละรายการ
            </p>
          </div>
        </CardContent>
      </Card>

      <VaultImportUploader />

      <Card className="mt-4">
        <CardHeader><CardTitle>รูปแบบไฟล์ / File Format</CardTitle></CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            แถวแรกคือหัวคอลัมน์ (ชื่ออังกฤษ ไม่สนตัวพิมพ์ใหญ่-เล็ก) ใช้ sheet แรกของไฟล์ Excel
            แต่ละแถวต้องมี <code>name</code> และมีข้อมูลลับอย่างน้อยหนึ่งอย่าง
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>คอลัมน์ / Column</TableHead>
                <TableHead>จำเป็น</TableHead>
                <TableHead>คำอธิบาย</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COLUMN_DOCS.map((c) => (
                <TableRow key={c.col}>
                  <TableCell className="font-mono text-xs">{c.col}</TableCell>
                  <TableCell>{c.req ? "✔" : "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.desc}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
