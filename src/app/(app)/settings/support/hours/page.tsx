import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate } from "@/lib/utils";
import { MessageBanner } from "../message-banner";
import { saveBusinessHours, addHoliday, deleteHoliday } from "../actions";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["อาทิตย์ / Sun", "จันทร์ / Mon", "อังคาร / Tue", "พุธ / Wed", "พฤหัส / Thu", "ศุกร์ / Fri", "เสาร์ / Sat"];
const DEFAULT_DAYS: Array<[number, number] | null> = [null, [510, 1050], [510, 1050], [510, 1050], [510, 1050], [510, 1050], null];

function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("support:settings");
  const sp = await searchParams;
  const [setting, holidays] = await Promise.all([
    prisma.systemSetting.findFirst({ where: { organizationId: user.organizationId, key: "support.businessHours" } }),
    prisma.holiday.findMany({ where: { organizationId: user.organizationId }, orderBy: { date: "asc" } }),
  ]);
  const val = (setting?.value as { days?: Array<[number, number] | null>; timezoneOffsetMinutes?: number } | undefined) ?? {};
  const days = val.days ?? DEFAULT_DAYS;
  const tz = val.timezoneOffsetMinutes ?? 420;

  return (
    <div>
      <PageHeader title="เวลาทำการและวันหยุด / Business Hours & Holidays" description="ใช้คำนวณ SLA แบบเวลาทำการ (Business hours only)">
        <Button variant="outline" asChild><Link href="/settings/support">← กลับ / Back</Link></Button>
      </PageHeader>
      <MessageBanner ok={sp.ok} error={sp.error} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>เวลาทำการ / Business hours</CardTitle></CardHeader>
          <CardContent>
            <form action={saveBusinessHours} className="space-y-2">
              {DAY_NAMES.map((label, d) => {
                const win = days[d];
                return (
                  <div key={d} className="flex items-center gap-2">
                    <label className="flex w-32 items-center gap-2 text-sm">
                      <input type="checkbox" name={`day-${d}-enabled`} defaultChecked={!!win} className="h-4 w-4 rounded border-input" />
                      {label}
                    </label>
                    <Input type="time" name={`day-${d}-start`} defaultValue={win ? toHHMM(win[0]) : "08:30"} className="w-32" />
                    <span className="text-muted-foreground">–</span>
                    <Input type="time" name={`day-${d}-end`} defaultValue={win ? toHHMM(win[1]) : "17:30"} className="w-32" />
                  </div>
                );
              })}
              <div className="flex items-center gap-2 pt-2">
                <Label htmlFor="tz" className="text-sm">Timezone offset (นาที)</Label>
                <Input id="tz" name="timezoneOffsetMinutes" type="number" defaultValue={tz} className="w-28" />
                <span className="text-xs text-muted-foreground">420 = Asia/Bangkok</span>
              </div>
              <Button type="submit" className="mt-2">บันทึกเวลาทำการ / Save</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>วันหยุด / Holidays</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <form action={addHoliday} className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="date">วันที่ / Date</Label>
                <Input id="date" name="date" type="date" required />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="name">ชื่อวันหยุด / Name</Label>
                <Input id="name" name="name" required maxLength={120} />
              </div>
              <Button type="submit">เพิ่ม</Button>
            </form>
            <ul className="space-y-1.5">
              {holidays.length === 0 && <li className="text-sm text-muted-foreground">ยังไม่มีวันหยุด / No holidays</li>}
              {holidays.map((h) => {
                const del = deleteHoliday.bind(null, h.id);
                return (
                  <li key={h.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>{formatDate(h.date)} — {h.name}</span>
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
    </div>
  );
}
