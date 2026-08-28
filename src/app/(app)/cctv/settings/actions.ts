"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { saveCctvSettings } from "@/lib/services/cctv-settings";

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
