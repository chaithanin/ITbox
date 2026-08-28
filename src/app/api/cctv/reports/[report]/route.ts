import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { getCctvSettings, retentionStatus, gapStatus } from "@/lib/services/cctv-settings";

export const dynamic = "force-dynamic";

type Row = (string | number)[];
interface Report { title: string; columns: string[]; rows: Row[]; }

const days = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const gb = (n?: bigint | null) => (n == null ? "" : (Number(n) / 1024 ** 3).toFixed(1));

async function buildReport(report: string, orgId: string): Promise<Report | null> {
  const s = await getCctvSettings(orgId);
  if (report === "retention") {
    const cams = await prisma.cctvCamera.findMany({ where: { organizationId: orgId, deletedAt: null }, include: { recorder: { select: { name: true, project: true } } }, orderBy: [{ recorderId: "asc" }, { channel: "asc" }] });
    return {
      title: "CCTV Retention Compliance",
      columns: ["Project", "Recorder", "Channel", "Camera", "Earliest", "Latest", "ActualDays", "RequiredDays", "Compliance"],
      rows: cams.map((c) => [c.recorder.project ?? "", c.recorder.name, c.channel, c.name ?? "", days(c.earliestRecordingAt), days(c.latestRecordingAt), c.retentionDays != null ? Number(c.retentionDays.toFixed(1)) : "", s.minRetentionDays, retentionStatus(c.retentionDays, s.minRetentionDays)]),
    };
  }
  if (report === "gaps") {
    const cams = await prisma.cctvCamera.findMany({ where: { organizationId: orgId, deletedAt: null }, include: { recorder: { select: { name: true, project: true } } }, orderBy: [{ recordingGapSeconds: "desc" }] });
    const flagged = cams.filter((c) => { const st = gapStatus(c.recordingGapSeconds, s); return st === "WARNING" || st === "CRITICAL" || c.recordingStatus === "NO_RECORDING_FOUND"; });
    return {
      title: "CCTV Recording Gap",
      columns: ["Project", "Recorder", "Channel", "Camera", "LatestRecording", "GapMinutes", "RecordingStatus", "Severity"],
      rows: flagged.map((c) => [c.recorder.project ?? "", c.recorder.name, c.channel, c.name ?? "", days(c.latestRecordingAt), c.recordingGapSeconds != null ? Math.round(c.recordingGapSeconds / 60) : "", c.recordingStatus, c.recordingStatus === "NO_RECORDING_FOUND" ? "CRITICAL" : gapStatus(c.recordingGapSeconds, s)]),
    };
  }
  if (report === "storage") {
    const [recs, logs] = await Promise.all([
      prisma.cctvRecorder.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true, project: true } }),
      prisma.cctvStorageLog.findMany({ where: { organizationId: orgId }, orderBy: { checkedAt: "desc" }, take: 1000 }),
    ]);
    const meta = new Map(recs.map((r) => [r.id, r]));
    const latest = new Map<string, (typeof logs)[number]>();
    for (const l of logs) { const k = `${l.recorderId}#${l.hddIndex}`; if (!latest.has(k)) latest.set(k, l); }
    const agg = new Map<string, { name: string; project: string; cap: number; used: number; free: number; hdds: number }>();
    for (const l of latest.values()) {
      const m = meta.get(l.recorderId); if (!m) continue;
      const a = agg.get(l.recorderId) ?? { name: m.name, project: m.project ?? "", cap: 0, used: 0, free: 0, hdds: 0 };
      a.cap += Number(l.capacityBytes ?? 0n); a.used += Number(l.usedBytes ?? 0n); a.free += Number(l.freeBytes ?? 0n); a.hdds++;
      agg.set(l.recorderId, a);
    }
    return {
      title: "CCTV Storage / HDD",
      columns: ["Project", "Recorder", "HDDs", "CapacityGB", "UsedGB", "FreeGB", "FreePercent"],
      rows: [...agg.values()].map((a) => [a.project, a.name, a.hdds, (a.cap / 1024 ** 3).toFixed(0), (a.used / 1024 ** 3).toFixed(0), (a.free / 1024 ** 3).toFixed(0), a.cap > 0 ? ((a.free / a.cap) * 100).toFixed(1) : ""]),
    };
  }
  if (report === "daily") {
    const cams = await prisma.cctvCamera.findMany({ where: { organizationId: orgId, deletedAt: null, status: { in: ["OFFLINE", "VIDEO_LOSS", "STREAM_ERROR", "NETWORK_ERROR", "NO_RECORDING"] } }, include: { recorder: { select: { name: true, project: true } } } });
    return {
      title: "CCTV Daily Health - Problem Cameras",
      columns: ["Project", "Recorder", "Channel", "Camera", "Status", "OfflineSince", "LatestRecording"],
      rows: cams.map((c) => [c.recorder.project ?? "", c.recorder.name, c.channel, c.name ?? "", c.status, c.offlineSince ? new Date(c.offlineSince).toISOString() : "", days(c.latestRecordingAt)]),
    };
  }
  return null;
}

function toCsv(r: Report): string {
  const esc = (v: string | number) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
  return "﻿" + [r.columns.map(esc).join(","), ...r.rows.map((row) => row.map(esc).join(","))].join("\r\n") + "\r\n";
}

async function toXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(r.title.slice(0, 30));
  ws.addRow(r.columns); ws.getRow(1).font = { bold: true };
  for (const row of r.rows) ws.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const GET = apiHandler(async (req: Request, ctx: { params: Promise<{ report: string }> }) => {
  const user = await requirePermission("cctv:view");
  const { report } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const data = await buildReport(report, user.organizationId);
  if (!data) return NextResponse.json({ error: "unknown_report" }, { status: 404 });

  await auditLog(user, { action: "EXPORT", entityType: "CCTV_REPORT", detail: { report, format, rows: data.rows.length } });
  const fname = `cctv_${report}_${new Date().toISOString().slice(0, 10)}.${format}`;
  if (format === "csv") {
    return new NextResponse(toCsv(data), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fname}"` } });
  }
  const buf = await toXlsx(data);
  return new NextResponse(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fname}"` },
  });
});
