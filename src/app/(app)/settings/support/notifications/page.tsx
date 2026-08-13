import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageBanner } from "../message-banner";
import { saveNotificationPolicy } from "../actions";

export const dynamic = "force-dynamic";

const EVENTS: { key: string; label: string }[] = [
  { key: "case_created", label: "เปิดเคส / Case created" },
  { key: "assigned", label: "มอบหมาย / Assigned" },
  { key: "status_change", label: "เปลี่ยนสถานะ / Status change" },
  { key: "sla_warning", label: "ใกล้เกิน SLA / SLA warning" },
  { key: "sla_breach", label: "เกิน SLA / SLA breach" },
  { key: "resolved", label: "แก้ไขแล้ว / Resolved" },
  { key: "closed", label: "ปิดเคส / Closed" },
  { key: "reopened", label: "เปิดใหม่ / Reopened" },
];
const CHANNELS: { key: string; label: string }[] = [
  { key: "in_app", label: "In-App" },
  { key: "email", label: "Email" },
  { key: "line", label: "LINE" },
];

// Sensible defaults when nothing saved yet
const DEFAULTS: Record<string, Record<string, boolean>> = {
  case_created: { in_app: true, email: true, line: false },
  assigned: { in_app: true, email: false, line: false },
  status_change: { in_app: true, email: false, line: false },
  sla_warning: { in_app: true, email: true, line: false },
  sla_breach: { in_app: true, email: true, line: true },
  resolved: { in_app: true, email: true, line: false },
  closed: { in_app: true, email: false, line: false },
  reopened: { in_app: true, email: true, line: false },
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("support:settings");
  const sp = await searchParams;
  const setting = await prisma.systemSetting.findFirst({
    where: { organizationId: user.organizationId, key: "support.notifications" },
  });
  const saved = (setting?.value as Record<string, Record<string, boolean>> | undefined) ?? {};
  const on = (ev: string, ch: string) => saved[ev]?.[ch] ?? DEFAULTS[ev]?.[ch] ?? false;

  return (
    <div>
      <PageHeader title="การแจ้งเตือน / Notification Events" description="เลือกช่องทางแจ้งเตือนต่อเหตุการณ์ (In-App ทำงานเสมอ · Email/LINE ต้องตั้งค่า SMTP/LINE)">
        <Button variant="outline" asChild><Link href="/settings/support">← กลับ / Back</Link></Button>
      </PageHeader>
      <MessageBanner ok={sp.ok} error={sp.error} />

      <Card>
        <CardHeader><CardTitle>เมทริกซ์การแจ้งเตือน / Matrix</CardTitle></CardHeader>
        <CardContent>
          <form action={saveNotificationPolicy}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">เหตุการณ์ / Event</th>
                    {CHANNELS.map((c) => (<th key={c.key} className="py-2 text-center">{c.label}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {EVENTS.map((ev) => (
                    <tr key={ev.key} className="border-b">
                      <td className="py-2.5 font-medium">{ev.label}</td>
                      {CHANNELS.map((c) => (
                        <td key={c.key} className="py-2.5 text-center">
                          <input type="checkbox" name={`${ev.key}-${c.key}`} defaultChecked={on(ev.key, c.key)} className="h-4 w-4 rounded border-input" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="submit" className="mt-4">บันทึกการแจ้งเตือน / Save</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
