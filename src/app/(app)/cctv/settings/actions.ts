"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { getCctvSettings, saveCctvSettings } from "@/lib/services/cctv-settings";
import { buildDailyCctvSummary } from "@/lib/services/cctv-report";
import { sendEmail } from "@/lib/services/email";

const int = (min: number, max: number) =>
  z.preprocess((v) => (v === "" || v == null ? undefined : Math.round(Number(v))), z.number().int().min(min).max(max));

const schema = z.object({
  minRetentionDays: int(1, 3650),
  gapWarnMinutes: int(1, 1440),
  gapCriticalMinutes: int(1, 1440),
  healthCheckIntervalMin: int(1, 1440),
  recordingCheckIntervalMin: int(1, 1440),
  storageCheckIntervalMin: int(1, 1440),
  snapshotIntervalMin: int(1, 1440),
  screenshotRetentionDays: int(1, 3650),
  hddWarnFreePercent: int(0, 100),
  hddCriticalFreePercent: int(0, 100),
  dailyReportTime: z.string().regex(/^\d{2}:\d{2}$/).optional().default("08:00"),
  reportRecipients: z.string().max(2000).optional().default(""),
  timezone: z.string().max(64).optional().default("Asia/Bangkok"),
});

export async function saveCctvSettingsAction(formData: FormData) {
  const user = await requirePermission("cctv:manage");
  const parsed = schema.parse(Object.fromEntries(formData));
  await saveCctvSettings(user.organizationId, parsed);
  await auditLog(user, { action: "UPDATE", entityType: "CCTV_SETTINGS", detail: { minRetentionDays: parsed.minRetentionDays } });
  revalidatePath("/cctv/settings");
  redirect("/cctv/settings?saved=1");
}

/** Send the daily CCTV report immediately to this org's configured recipients (test). */
export async function sendCctvDailyTest() {
  const user = await requirePermission("cctv:manage");
  const settings = await getCctvSettings(user.organizationId);
  const to = settings.reportRecipients.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /@/.test(x));
  if (to.length === 0) redirect("/cctv/settings?report=norecipients");
  const summary = await buildDailyCctvSummary(user.organizationId);
  const text = [
    `รายงานสุขภาพ CCTV ประจำวัน (ทดสอบ) / Daily CCTV Health Report (test)`,
    `ประจำวันที่ ${summary.date}`,
    ``,
    `เครื่องบันทึก ${summary.recorders} (ออฟไลน์ ${summary.recordersOffline}) · กล้อง ${summary.cameras} (ออฟไลน์ ${summary.camerasOffline})`,
    `Video Loss ${summary.videoLoss} · ไม่บันทึก ${summary.noRecording} · HDD เตือน ${summary.hddWarnings}`,
    `เหตุการณ์ใหม่วันนี้ ${summary.newIncidents} · กู้คืน ${summary.recovered}`,
    ``,
    summary.problems.length === 0 ? "ไม่มีกล้องผิดปกติ" : `กล้องผิดปกติ ${summary.problems.length} ตัว:`,
    ...summary.problems.map((p) => `  [${p.project}] ${p.recorder} ch${p.channel} — ${p.camera}: ${p.status}`),
    ``, "— TECHCORE CCTV Monitoring",
  ].join("\n");
  const ok = await sendEmail({ to, subject: `CCTV Daily Report (test) — ${summary.date}`, text });
  await auditLog(user, { action: "EXPORT", entityType: "CCTV_REPORT", detail: { test: true, sent: ok, recipients: to.length } });
  redirect(`/cctv/settings?report=${ok ? "sent" : "failed"}`);
}
