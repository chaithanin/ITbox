import { Download, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const REPORTS: { title: string; description: string; href: string }[] = [
  {
    title: "ทะเบียนทรัพย์สิน / Asset Inventory",
    description: "ทรัพย์สินทั้งหมดพร้อมหมวดหมู่ แผนก สถานที่ และมูลค่า / All assets with category, department, location and value.",
    href: "/api/reports/assets",
  },
  {
    title: "ทรัพย์สินตามแผนก / Assets by Department",
    description: "สรุปจำนวนทรัพย์สินแยกตามแผนก / Asset counts aggregated per department.",
    href: "/api/reports/assets-by-department",
  },
  {
    title: "การเบิก-คืนทรัพย์สิน / Asset Assignments",
    description: "ประวัติการเบิกและคืนทรัพย์สินของพนักงาน / Check-out / return history per employee.",
    href: "/api/reports/assignments",
  },
  {
    title: "งานซ่อมบำรุง / Maintenance",
    description: "ใบแจ้งซ่อมทั้งหมด สถานะ และค่าใช้จ่าย / All maintenance tickets with status and cost.",
    href: "/api/reports/maintenance",
  },
  {
    title: "การรับประกัน / Warranty",
    description: "ทรัพย์สินที่การรับประกันจะหมดอายุภายใน 90 วัน / Assets with warranty ending within 90 days.",
    href: "/api/reports/warranty",
  },
  {
    title: "ไลเซนส์ซอฟต์แวร์ / Licenses",
    description: "ไลเซนส์ทั้งหมด จำนวนที่นั่ง และวันหมดอายุ / All licenses, seats and expiry dates.",
    href: "/api/reports/licenses",
  },
  {
    title: "บริการสมาชิก / Subscriptions",
    description: "บริการรายเดือน/รายปี ค่าใช้จ่าย และวันต่ออายุ / Recurring services, cost and renewal dates.",
    href: "/api/reports/subscriptions",
  },
  {
    title: "การจัดซื้อ / Purchases",
    description: "คำขอจัดซื้อทั้งหมดและสถานะการอนุมัติ / All purchase requests and approval status.",
    href: "/api/reports/purchases",
  },
  {
    title: "บันทึกตรวจสอบ / Audit",
    description: "บันทึกการใช้งานระบบ 10,000 รายการล่าสุด (ต้องมีสิทธิ์ audit:read) / Last 10,000 audit log rows (requires audit:read).",
    href: "/api/reports/audit",
  },
  {
    title: "การเข้าถึง Vault / Vault Access",
    description: "ประวัติการเข้าถึงรายการ Vault — เฉพาะข้อมูลเมทาดาทา (ต้องมีสิทธิ์ audit:read) / Vault access history — metadata only (requires audit:read).",
    href: "/api/reports/vault-access",
  },
];

export default async function ReportsPage() {
  const user = await requireUser();

  if (!user.permissions.has("report:read")) {
    return (
      <div>
        <PageHeader title="รายงาน / Reports" />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (ต้องมีสิทธิ์ report:read) / You do not have access to this
            page (requires report:read).
          </CardContent>
        </Card>
      </div>
    );
  }

  const canExport = user.permissions.has("report:export");

  return (
    <div>
      <PageHeader
        title="รายงาน / Reports"
        description="ส่งออกข้อมูลเป็นไฟล์ CSV / Export data as CSV files"
      />
      <div className="mb-4 flex items-start gap-2 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p>
          รายงาน Vault ไม่มีค่าความลับ (รหัสผ่าน/คีย์) ปะปนอยู่เด็ดขาด — ส่งออกเฉพาะข้อมูลเมทาดาทาเท่านั้น
          / Vault reports never contain secret values — metadata only.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <Card key={r.href}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{r.title}</CardTitle>
              <CardDescription>{r.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {canExport ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={r.href}>
                    <Download className="h-4 w-4" />
                    ส่งออก CSV / Export CSV
                  </a>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  ต้องมีสิทธิ์ report:export / Requires report:export
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
