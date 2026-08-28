import { prisma } from "@/lib/prisma";

/**
 * CCTV monitoring settings, stored per-org in SystemSetting (key "cctv.settings").
 * All thresholds/intervals the spec calls out are configurable here; sensible
 * defaults apply until an admin overrides them.
 */
export interface CctvSettings {
  minRetentionDays: number;      // required recording retention (compliance)
  gapWarnMinutes: number;        // recording gap -> WARNING above this
  gapCriticalMinutes: number;    // recording gap -> CRITICAL above this
  healthCheckIntervalMin: number;
  recordingCheckIntervalMin: number;
  storageCheckIntervalMin: number;
  snapshotIntervalMin: number;
  screenshotRetentionDays: number;
  hddWarnFreePercent: number;    // free% below this -> storage WARNING
  hddCriticalFreePercent: number;
  dailyReportTime: string;       // "08:00"
  reportRecipients: string;      // comma-separated emails
  timezone: string;
}

export const CCTV_DEFAULTS: CctvSettings = {
  minRetentionDays: 30,
  gapWarnMinutes: 5,
  gapCriticalMinutes: 15,
  healthCheckIntervalMin: 5,
  recordingCheckIntervalMin: 15,
  storageCheckIntervalMin: 60,
  snapshotIntervalMin: 60,
  screenshotRetentionDays: 30,
  hddWarnFreePercent: 10,
  hddCriticalFreePercent: 3,
  dailyReportTime: "08:00",
  reportRecipients: "",
  timezone: "Asia/Bangkok",
};

const KEY = "cctv.settings";

export async function getCctvSettings(organizationId: string): Promise<CctvSettings> {
  const row = await prisma.systemSetting.findFirst({ where: { organizationId, key: KEY }, select: { value: true } });
  const v = (row?.value ?? {}) as Partial<CctvSettings>;
  return { ...CCTV_DEFAULTS, ...v };
}

export async function saveCctvSettings(organizationId: string, patch: Partial<CctvSettings>): Promise<void> {
  const current = await getCctvSettings(organizationId);
  const next = { ...current, ...patch };
  await prisma.systemSetting.upsert({
    where: { organizationId_key: { organizationId, key: KEY } },
    create: { organizationId, key: KEY, value: next as never },
    update: { value: next as never },
  });
}

/** Compliance status for an actual retention (days) vs the required minimum. */
export function retentionStatus(actualDays: number | null | undefined, minDays: number): "PASS" | "WARNING" | "CRITICAL" | "UNKNOWN" {
  if (actualDays == null) return "UNKNOWN";
  if (actualDays >= minDays) return "PASS";
  if (actualDays >= minDays * 0.7) return "WARNING";
  return "CRITICAL";
}

/** Recording-gap severity (seconds) against configured thresholds. */
export function gapStatus(gapSeconds: number | null | undefined, s: CctvSettings): "NORMAL" | "WARNING" | "CRITICAL" | "UNKNOWN" {
  if (gapSeconds == null) return "UNKNOWN";
  if (gapSeconds >= s.gapCriticalMinutes * 60) return "CRITICAL";
  if (gapSeconds >= s.gapWarnMinutes * 60) return "WARNING";
  return "NORMAL";
}
