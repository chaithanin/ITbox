import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate } from "@/lib/utils";
import { MessageBanner } from "../message-banner";
import { addAgentDayOff, deleteAgentDayOff } from "../actions";

export const dynamic = "force-dynamic";

export default async function AgentLeavePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("support:settings");
  const sp = await searchParams;

  // Today at UTC midnight — matches @db.Date columns.
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [members, daysOff, orgHolidays] = await Promise.all([
    prisma.supportTeamMember.findMany({
      where: { team: { organizationId: user.organizationId } },
      select: { user: { select: { id: true, name: true, email: true } } },
      distinct: ["userId"],
    }),
    prisma.agentDayOff.findMany({
      where: { organizationId: user.organizationId, date: { gte: today } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: [{ date: "asc" }],
    }),
    prisma.holiday.findMany({
      where: { organizationId: user.organizationId, date: { gte: today } },
      orderBy: { date: "asc" },
      take: 20,
    }),
  ]);
  const agents = members
    .map((m) => m.user)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader
        title="ตารางวันหยุดเจ้าหน้าที่ / Agent Days Off"
        description="วันไหนเจ้าหน้าที่หยุด/ลา ระบบจะไม่มอบหมายเคสให้อัตโนมัติในวันนั้น"
      >
        <Button variant="outline" asChild><Link href="/settings/support">← กลับ / Back</Link></Button>
      </PageHeader>
      <MessageBanner ok={sp.ok} error={sp.error} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>เพิ่มวันหยุด/วันลา / Add a day off</CardTitle></CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ยังไม่มีเจ้าหน้าที่ในทีมซัพพอร์ต — เพิ่มสมาชิกทีมก่อนที่{" "}
                <Link href="/settings/support/teams" className="text-primary hover:underline">ตั้งค่าทีม / Teams</Link>
              </p>
            ) : (
              <form action={addAgentDayOff} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="userId">เจ้าหน้าที่ / Agent</Label>
                  <Select id="userId" name="userId" required>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="date">วันที่ / Date</Label>
                    <Input id="date" name="date" type="date" required />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="reason">เหตุผล / Reason (optional)</Label>
                    <Input id="reason" name="reason" maxLength={200} placeholder="ลาพักร้อน / ลากิจ / ป่วย" />
                  </div>
                  <Button type="submit">เพิ่ม / Add</Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>วันหยุดที่จะถึง / Upcoming days off</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {daysOff.length === 0 && <li className="text-sm text-muted-foreground">ยังไม่มีวันหยุด / No days off scheduled</li>}
              {daysOff.map((d) => {
                const del = deleteAgentDayOff.bind(null, d.id);
                return (
                  <li key={d.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>
                      <span className="font-medium">{formatDate(d.date)}</span>
                      {" — "}{d.user.name}
                      {d.reason ? <span className="text-muted-foreground"> · {d.reason}</span> : null}
                    </span>
                    <form action={del}>
                      <ConfirmButton variant="ghost" size="sm" confirmText="ลบวันหยุดนี้?">ลบ</ConfirmButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>วันหยุดบริษัท / Company holidays</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            วันหยุดบริษัทหยุดทั้งองค์กร — วันนั้นเคสจะไม่ถูกมอบหมายให้ใครเลย (ค้างในคิว).
            จัดการที่{" "}
            <Link href="/settings/support/hours" className="text-primary hover:underline">เวลาทำการและวันหยุด / Business Hours</Link>
          </p>
          <ul className="flex flex-wrap gap-2">
            {orgHolidays.length === 0 && <li className="text-sm text-muted-foreground">— ไม่มีวันหยุดบริษัทที่จะถึง —</li>}
            {orgHolidays.map((h) => (
              <li key={h.id} className="rounded-md border px-2 py-1 text-xs">{formatDate(h.date)} · {h.name}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
