import Link from "next/link";
import {
  Inbox,
  Tags,
  FolderTree,
  Timer,
  Users,
  GitBranch,
  CalendarClock,
  CalendarOff,
  Bell,
} from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";

export default async function SupportSettingsHub() {
  const user = await requirePermission("support:settings");
  const orgId = user.organizationId;

  const [typeCount, categoryCount, teamCount, holidayCount] = await Promise.all([
    prisma.caseType.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.caseCategory.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.supportTeam.count({ where: { organizationId: orgId, deletedAt: null } }),
    prisma.holiday.count({ where: { organizationId: orgId } }),
  ]);

  const sections = [
    {
      href: "/settings/support/creation",
      icon: Inbox,
      title: "การเปิดเคส / Case Creation",
      desc: "ช่องทางรับแจ้ง, เปิดแทนผู้อื่น, ฟิลด์บังคับ, ใครเปิดเคสได้",
    },
    {
      href: "/settings/support/types",
      icon: Tags,
      title: "ประเภทเคส / Case Types",
      desc: "จัดการประเภท (INCIDENT, SERVICE_REQUEST...) และรหัสนำหน้าเลขเคส",
    },
    {
      href: "/settings/support/categories",
      icon: FolderTree,
      title: "หมวดหมู่ / Categories",
      desc: "โครงสร้างหมวดหมู่แบบต้นไม้ + ทีมที่รับผิดชอบ + ความสำคัญเริ่มต้น",
    },
    {
      href: "/settings/support/sla",
      icon: Timer,
      title: "ความสำคัญและ SLA / Priority & SLA",
      desc: "กำหนดเวลาตอบกลับ/แก้ไขตามระดับความสำคัญ P1–P4 และการยกระดับ",
    },
    {
      href: "/settings/support/teams",
      icon: Users,
      title: "การมอบหมายอัตโนมัติ / Auto Assignment (Teams)",
      desc: "ทีมสนับสนุนและสมาชิก ใช้จ่ายงานตามหมวดหมู่และภาระงาน",
    },
    {
      href: "/settings/support/sla",
      icon: GitBranch,
      title: "ขั้นตอนการทำงาน / Workflow",
      desc: "สถานะเคส NEW → ... → CLOSED และกฎการเปลี่ยนสถานะ",
    },
    {
      href: "/settings/support/hours",
      icon: CalendarClock,
      title: "เวลาทำการและวันหยุด / Business Hours & Holidays",
      desc: "เวลาทำการรายวัน, เขตเวลา และวันหยุดที่ใช้คำนวณ SLA",
    },
    {
      href: "/settings/support/agent-leave",
      icon: CalendarOff,
      title: "วันหยุดเจ้าหน้าที่ / Agent Days Off",
      desc: "วันไหนเจ้าหน้าที่หยุด/ลา ระบบจะไม่มอบหมายเคสให้อัตโนมัติในวันนั้น",
    },
    {
      href: "/settings/support/notifications",
      icon: Bell,
      title: "การแจ้งเตือน / Notifications",
      desc: "เลือกช่องทางแจ้งเตือน (In-app / Email / LINE) ต่อเหตุการณ์",
    },
  ];

  return (
    <div>
      <PageHeader
        title="ตั้งค่า IT Support / IT Support Settings"
        description="กำหนดค่าโมดูลจัดการเคส (ITSM) ทั้งหมดขององค์กร"
      />

      <div className="mb-5 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="ประเภทเคส / Types" value={typeCount} href="/settings/support/types" />
        <StatCard
          label="หมวดหมู่ / Categories"
          value={categoryCount}
          href="/settings/support/categories"
        />
        <StatCard label="ทีม / Teams" value={teamCount} href="/settings/support/teams" />
        <StatCard label="วันหยุด / Holidays" value={holidayCount} href="/settings/support/hours" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => (
          <Link key={s.title} href={s.href}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <s.icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="font-medium leading-tight">{s.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
