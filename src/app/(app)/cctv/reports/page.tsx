import Link from "next/link";
import { ShieldCheck, Clock, HardDrive, CalendarDays } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const REPORTS = [
  { href: "/cctv/reports/retention", icon: ShieldCheck, title: "Retention Compliance", desc: "จำนวนวันที่เก็บภาพจริง เทียบกับที่กำหนด (PASS/WARNING/CRITICAL)" },
  { href: "/cctv/reports/gaps", icon: Clock, title: "Recording Gap", desc: "กล้องที่การบันทึกล่าช้า/ขาดช่วงเกินเกณฑ์" },
  { href: "/cctv/reports/storage", icon: HardDrive, title: "Storage / HDD", desc: "ความจุ ใช้ไป คงเหลือ และสถานะ HDD ต่อเครื่องบันทึก" },
  { href: "/cctv/reports/daily", icon: CalendarDays, title: "Daily Health", desc: "สรุปสุขภาพระบบประจำวัน + รายการกล้องที่ผิดปกติ" },
];

export default async function CctvReportsPage() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:view")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  return (
    <div>
      <PageHeader title="รายงาน CCTV / Reports" description="รายงานสุขภาพ การบันทึก การเก็บภาพ และพื้นที่จัดเก็บ" />
      <div className="grid gap-4 sm:grid-cols-2">
        {REPORTS.map((r) => (
          <Link key={r.href} href={r.href}>
            <Card className="transition-colors hover:bg-accent">
              <CardContent className="flex items-start gap-3 p-4">
                <r.icon className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-sm text-muted-foreground">{r.desc}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
