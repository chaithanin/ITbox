import { Cctv, Upload, ShieldCheck, AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { importDeviceXml } from "../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  nofile: "ไม่พบไฟล์ / No file selected.",
  toolarge: "ไฟล์ใหญ่เกิน 1MB / File exceeds 1MB.",
  empty: "ไม่พบ <Device> ในไฟล์ / No devices found in the XML.",
};

export default async function CctvImportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:manage")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const err = sp.error ? ERRORS[sp.error] ?? "เกิดข้อผิดพลาด / Error." : null;

  return (
    <div>
      <PageHeader title="นำเข้า device.xml / Import Device Master" description="อัปโหลดไฟล์ device.xml จาก Dahua ConfigTool/SmartPSS เพื่อสร้างทะเบียนเครื่องบันทึก CCTV" />

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="h-4 w-4" /> {err}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4" /> อัปโหลดไฟล์ / Upload</CardTitle></CardHeader>
          <CardContent>
            <form action={importDeviceXml} className="space-y-4">
              <input
                type="file" name="file" accept=".xml,text/xml,application/xml" required
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
              />
              <Button type="submit" className="w-full"><Cctv className="mr-2 h-4 w-4" /> นำเข้า / Import</Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              รองรับรูปแบบ <code>&lt;DeviceManager&gt;</code> ของ Dahua — จับคู่เครื่องด้วยหมายเลขซีเรียล (domain) และผูกกับทรัพย์สิน CCTV-IT ที่มีอยู่โดยอัตโนมัติ
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> ความปลอดภัย / Security</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>• รหัสผ่านถูกเข้ารหัสแบบ envelope (AES-256-GCM + KMS) — ไม่เก็บ/แสดงเป็น plaintext ที่ใดเลย</p>
            <p>• ไฟล์ device.xml ไม่ถูก commit เข้า Git (อยู่ใน .gitignore)</p>
            <p>• หน้าจอแสดงเฉพาะ <code>admin / ••••••</code> เท่านั้น ไม่มีการเปิดเผยรหัสจริง</p>
            <p>• แนะนำ: สร้างบัญชี read-only <code>cctv_monitor</code> บน NVR และหมุนรหัส admin หลังนำเข้า</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
