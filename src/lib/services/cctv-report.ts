import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/services/email";
import { getCctvSettings } from "@/lib/services/cctv-settings";

/**
 * Daily CCTV health report — plain-text summary emailed to the recipients set in
 * CCTV settings (per org). Called from the once-daily cron. No-op for an org with
 * no recorders or no recipients configured.
 */

export interface DailyCctvSummary {
  date: string;
  recorders: number;
  recordersOffline: number;
  cameras: number;
  camerasOffline: number;
  videoLoss: number;
  noRecording: number;
  hddWarnings: number;
  newIncidents: number;
  recovered: number;
  problems: { project: string; recorder: string; channel: number; camera: string; status: string }[];
}

export async function buildDailyCctvSummary(organizationId: string): Promise<DailyCctvSummary> {
  const now = new Date();
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);

  const [recorders, cameras, newIncidents, recovered, storage, problems] = await Promise.all([
    prisma.cctvRecorder.findMany({ where: { organizationId, deletedAt: null }, select: { status: true } }),
    prisma.cctvCamera.findMany({ where: { organizationId, deletedAt: null }, select: { status: true, recordingStatus: true } }),
    prisma.cctvIncident.count({ where: { organizationId, detectedAt: { gte: dayStart } } }),
    prisma.cctvIncident.count({ where: { organizationId, resolvedAt: { gte: dayStart } } }),
    prisma.cctvStorageLog.findMany({ where: { organizationId }, orderBy: { checkedAt: "desc" }, take: 200, select: { status: true, recorderId: true } }),
    prisma.cctvCamera.findMany({
      where: { organizationId, deletedAt: null, status: { in: ["OFFLINE", "VIDEO_LOSS", "STREAM_ERROR", "NETWORK_ERROR", "NO_RECORDING"] } },
      include: { recorder: { select: { name: true, project: true } } },
      take: 100,
    }),
  ]);

  const hddByRec = new Map<string, string>();
  for (const s of storage) if (!hddByRec.has(s.recorderId)) hddByRec.set(s.recorderId, s.status);

  return {
    date: dayStart.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }),
    recorders: recorders.length,
    recordersOffline: recorders.filter((r) => r.status === "OFFLINE").length,
    cameras: cameras.length,
    camerasOffline: cameras.filter((c) => c.status === "OFFLINE" || c.status === "NETWORK_ERROR").length,
    videoLoss: cameras.filter((c) => c.status === "VIDEO_LOSS").length,
    noRecording: cameras.filter((c) => c.recordingStatus === "NOT_RECORDING" || c.recordingStatus === "NO_RECORDING_FOUND").length,
    hddWarnings: [...hddByRec.values()].filter((s) => s === "WARNING" || s === "CRITICAL" || s === "FAILED").length,
    newIncidents,
    recovered,
    problems: problems.map((c) => ({ project: c.recorder.project ?? "-", recorder: c.recorder.name, channel: c.channel, camera: c.name ?? `Ch ${c.channel}`, status: c.status })),
  };
}

function renderText(s: DailyCctvSummary): string {
  const lines = [
    `รายงานสุขภาพ CCTV ประจำวัน / Daily CCTV Health Report`,
    `ประจำวันที่ ${s.date}`,
    ``,
    `สรุป / Summary`,
    `  เครื่องบันทึกทั้งหมด / Recorders: ${s.recorders} (ออฟไลน์ ${s.recordersOffline})`,
    `  กล้องทั้งหมด / Cameras: ${s.cameras} (ออฟไลน์ ${s.camerasOffline})`,
    `  Video Loss: ${s.videoLoss}`,
    `  ไม่บันทึก / No recording: ${s.noRecording}`,
    `  HDD เตือน / warnings: ${s.hddWarnings}`,
    `  เหตุการณ์ใหม่วันนี้ / New incidents: ${s.newIncidents}`,
    `  กู้คืนวันนี้ / Recovered: ${s.recovered}`,
    ``,
  ];
  if (s.problems.length === 0) {
    lines.push(`ไม่มีกล้องผิดปกติ / No problem cameras.`);
  } else {
    lines.push(`กล้องที่ผิดปกติ / Problem cameras (${s.problems.length}):`);
    for (const p of s.problems) lines.push(`  [${p.project}] ${p.recorder} ch${p.channel} — ${p.camera}: ${p.status}`);
  }
  lines.push("", "— TECHCORE CCTV Monitoring");
  return lines.join("\n");
}

/** Send the daily report to every org that has recorders and recipients configured. */
export async function sendDailyCctvReports(): Promise<{ orgsSent: number; recipients: number }> {
  const orgs = await prisma.cctvRecorder.groupBy({ by: ["organizationId"], where: { deletedAt: null }, _count: { _all: true } });
  let orgsSent = 0, recipients = 0;
  for (const o of orgs) {
    const settings = await getCctvSettings(o.organizationId);
    const to = settings.reportRecipients.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /@/.test(x));
    if (to.length === 0) continue;
    const summary = await buildDailyCctvSummary(o.organizationId);
    const ok = await sendEmail({ to, subject: `CCTV Daily Report — ${summary.date}`, text: renderText(summary) });
    if (ok) { orgsSent++; recipients += to.length; }
  }
  return { orgsSent, recipients };
}
