import { Settings, Save } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getCctvSettings } from "@/lib/services/cctv-settings";
import { saveCctvSettingsAction } from "./actions";

export const dynamic = "force-dynamic";

function Field({ id, label, value, type = "number", hint }: { id: string; label: string; value: string | number; type?: string; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} type={type} defaultValue={String(value)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function CctvSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:manage")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const s = await getCctvSettings(user.organizationId);

  return (
    <div>
      <PageHeader title="ตั้งค่า CCTV / Settings" description="เกณฑ์การแจ้งเตือน ความถี่การตรวจสอบ และการเก็บข้อมูล (ใช้ทั่วทั้งระบบ CCTV)" />
      {sp.saved && <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">บันทึกแล้ว / Saved.</div>}

      <form action={saveCctvSettingsAction} className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings className="h-4 w-4" /> การบันทึก & Retention</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="minRetentionDays" label="เก็บภาพขั้นต่ำ (วัน) / Min retention" value={s.minRetentionDays} hint="ใช้ตัดสิน PASS/WARNING/CRITICAL ในรายงาน compliance" />
            <Field id="gapWarnMinutes" label="Recording gap เตือน (นาที)" value={s.gapWarnMinutes} />
            <Field id="gapCriticalMinutes" label="Recording gap วิกฤต (นาที)" value={s.gapCriticalMinutes} />
            <Field id="screenshotRetentionDays" label="เก็บภาพ snapshot (วัน)" value={s.screenshotRetentionDays} hint="เฉพาะภาพที่ระบบเก็บ ไม่แตะการบันทึกใน NVR" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ความถี่การตรวจสอบ (นาที) / Check intervals</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="healthCheckIntervalMin" label="สถานะกล้อง / Health" value={s.healthCheckIntervalMin} />
            <Field id="recordingCheckIntervalMin" label="การบันทึก / Recording" value={s.recordingCheckIntervalMin} />
            <Field id="storageCheckIntervalMin" label="พื้นที่ / Storage" value={s.storageCheckIntervalMin} />
            <Field id="snapshotIntervalMin" label="Snapshot" value={s.snapshotIntervalMin} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">พื้นที่ HDD & รายงาน / Storage & Reports</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="hddWarnFreePercent" label="HDD ว่าง% เตือน" value={s.hddWarnFreePercent} />
            <Field id="hddCriticalFreePercent" label="HDD ว่าง% วิกฤต" value={s.hddCriticalFreePercent} />
            <Field id="dailyReportTime" label="เวลาส่งรายงานประจำวัน" value={s.dailyReportTime} type="time" />
            <Field id="reportRecipients" label="อีเมลผู้รับรายงาน (คั่นด้วย ,)" value={s.reportRecipients} type="text" />
            <Field id="timezone" label="Timezone" value={s.timezone} type="text" />
          </CardContent>
        </Card>

        <Button type="submit"><Save className="mr-2 h-4 w-4" /> บันทึก / Save</Button>
      </form>
    </div>
  );
}
