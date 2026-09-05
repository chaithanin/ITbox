import Link from "next/link";
import { Users, ShieldCheck, UserCog, Building2, LifeBuoy, PlugZap } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SettingsPage() {
  const user = await requireUser();
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: user.organizationId },
  });

  const cards = [
    {
      href: "/settings/organization",
      icon: Building2,
      title: "ข้อมูลองค์กร / Organization",
      desc: "ชื่อบริษัท เลขผู้เสียภาษี ที่อยู่ และโลโก้",
      show: user.permissions.has("settings:manage"),
    },
    {
      href: "/settings/integrations",
      icon: PlugZap,
      title: "การเชื่อมต่อ / Integrations",
      desc: "API key + Synology collector สำหรับดึงสถานะ Backup/Storage อัตโนมัติ",
      show: user.permissions.has("settings:manage"),
    },
    {
      href: "/settings/profile",
      icon: UserCog,
      title: "โปรไฟล์และความปลอดภัย / Profile & Security",
      desc: "เปลี่ยนรหัสผ่าน, เปิดใช้ MFA, จัดการ Session",
      show: true,
    },
    {
      href: "/settings/users",
      icon: Users,
      title: "ผู้ใช้งาน / Users",
      desc: "สร้างบัญชี กำหนดบทบาท ปิดใช้งาน",
      show: user.permissions.has("user:manage"),
    },
    {
      href: "/settings/roles",
      icon: ShieldCheck,
      title: "บทบาทและสิทธิ์ / Roles & Permissions",
      desc: "กำหนดสิทธิ์การเข้าถึงของแต่ละบทบาท (RBAC)",
      show: user.permissions.has("role:manage"),
    },
    {
      href: "/settings/support",
      icon: LifeBuoy,
      title: "ตั้งค่า IT Support / Case Settings",
      desc: "ประเภทเคส, หมวดหมู่, Priority & SLA, ทีม, เวลาทำการ, การแจ้งเตือน",
      show: user.permissions.has("support:settings"),
    },
    {
      href: "/settings/permission-profiles",
      icon: ShieldCheck,
      title: "โปรไฟล์สิทธิ์ / Permission Profiles",
      desc: "กำหนดสิทธิ์มาตรฐานตามแผนก/ตำแหน่ง/ระดับ สำหรับแบบฟอร์มขอสิทธิ์",
      show: user.permissions.has("permprofile:manage"),
    },
  ];

  return (
    <div>
      <PageHeader title="ตั้งค่าระบบ / Settings" />
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4" /> องค์กร / Organization
          </CardTitle>
          <CardDescription>
            {org.name} · <span className="font-mono">{org.slug}</span>
          </CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards
          .filter((c) => c.show)
          .map((c) => (
            <Link key={c.href} href={c.href}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <c.icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="font-medium leading-tight">{c.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
      </div>
    </div>
  );
}
