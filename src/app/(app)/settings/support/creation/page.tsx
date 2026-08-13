import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageBanner } from "../message-banner";
import { saveCasePolicy } from "../actions";

export const dynamic = "force-dynamic";

const CHANNELS = [
  { key: "web", label: "เว็บ / Web" },
  { key: "email", label: "อีเมล / Email" },
  { key: "line", label: "LINE OA" },
  { key: "mobile", label: "Mobile / PWA" },
  { key: "monitoring", label: "ระบบ Monitoring (อัตโนมัติ)" },
];
const REQUIRED_FIELDS = [
  { key: "subject", label: "หัวข้อ / Subject" },
  { key: "description", label: "รายละเอียด / Description" },
  { key: "category", label: "หมวดหมู่ / Category" },
  { key: "location", label: "สถานที่ / Location" },
  { key: "asset", label: "อุปกรณ์ / Asset" },
  { key: "impact", label: "ระดับผลกระทบ / Impact" },
];
const ROLES = ["EMPLOYEE", "IT_STAFF", "IT_MANAGER", "HR", "FINANCE", "MANAGER", "ADMIN"];

const DEFAULTS = {
  channels: { web: true, email: false, line: false, mobile: true, monitoring: false } as Record<string, boolean>,
  allowOnBehalf: true,
  requiredFields: { subject: true, description: true, category: false, location: false, asset: false, impact: true } as Record<string, boolean>,
  whoCanCreate: ["EMPLOYEE", "IT_STAFF", "IT_MANAGER", "HR", "FINANCE", "MANAGER"] as string[],
};

export default async function CreationPolicyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("support:settings");
  const sp = await searchParams;
  const setting = await prisma.systemSetting.findFirst({
    where: { organizationId: user.organizationId, key: "support.casePolicy" },
  });
  const v = (setting?.value as typeof DEFAULTS | undefined) ?? DEFAULTS;
  const channels = v.channels ?? DEFAULTS.channels;
  const required = v.requiredFields ?? DEFAULTS.requiredFields;
  const who = new Set(v.whoCanCreate ?? DEFAULTS.whoCanCreate);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="นโยบายการเปิดเคส / Case Creation" description="ใครเปิดเคสได้ · ช่องทาง · ฟิลด์ที่บังคับ">
        <Button variant="outline" asChild><Link href="/settings/support">← กลับ / Back</Link></Button>
      </PageHeader>
      <MessageBanner ok={sp.ok} error={sp.error} />

      <form action={saveCasePolicy} className="space-y-4">
        <Card>
          <CardHeader><CardTitle>ช่องทางเปิดเคส / Channels</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {CHANNELS.map((c) => (
              <label key={c.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`channel-${c.key}`} defaultChecked={channels[c.key] ?? false} className="h-4 w-4 rounded border-input" />
                {c.label}
              </label>
            ))}
            <p className="text-xs text-muted-foreground sm:col-span-2">
              หมายเหตุ: การรับเคสผ่าน Email/LINE OA แบบ inbound ยังไม่เปิดใช้ (ดูเอกสาร) — Web/Mobile/Monitoring API พร้อมใช้
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ใครเปิดเคสได้ / Who can create</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {ROLES.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="whoCanCreate" value={r} defaultChecked={who.has(r)} className="h-4 w-4 rounded border-input" />
                {r}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input type="checkbox" name="allowOnBehalf" defaultChecked={v.allowOnBehalf ?? true} className="h-4 w-4 rounded border-input" />
              อนุญาตให้ IT เปิดเคสแทนผู้ใช้อื่น / Allow on-behalf creation
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>ฟิลด์ที่บังคับ / Required fields</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {REQUIRED_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name={`req-${f.key}`} defaultChecked={required[f.key] ?? false} className="h-4 w-4 rounded border-input" />
                {f.label}
              </label>
            ))}
            <p className="text-xs text-muted-foreground sm:col-span-2">
              ผู้ใช้เลือกได้แค่ &quot;ระดับผลกระทบ&quot; ระบบกำหนด Priority ให้เอง IT ปรับภายหลังได้
            </p>
          </CardContent>
        </Card>

        <Button type="submit">บันทึกนโยบาย / Save policy</Button>
      </form>
    </div>
  );
}
