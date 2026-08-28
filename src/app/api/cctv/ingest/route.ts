import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveIngestOrg } from "@/lib/ingest-auth";

export const dynamic = "force-dynamic";

/**
 * CCTV health ingest — push model.
 * =================================
 * An on-prem collector connects to each Dahua recorder (read-only) and POSTs the
 * observed state here, authenticated by the org collector API key. Recorders are
 * matched by serial (already imported from device.xml); cameras/storage are
 * upserted; a compact health-log row is appended; and offline incidents are
 * opened/closed with dedup so the same outage is not re-raised every cycle.
 *
 * Body: { recorders: [{
 *   serial, status?, model?, firmware?, deviceType?, channelCount?, localIp?,
 *   capabilities?, errorMessage?,
 *   cameras?: [{ channel, name?, status?, streamStatus?, recordingStatus?,
 *     latestRecording?(ISO), earliestRecording?(ISO), recordingGapSeconds?,
 *     retentionDays?, retentionEstimated?, snapshot?: { status?, path?, w?, h? } }],
 *   storage?: [{ hddIndex, model?, status?, capacityBytes?, usedBytes?, freeBytes?, temperatureC?, smartStatus? }]
 * }] }
 */

const DEV_STATUS = new Set(["ONLINE", "OFFLINE", "AUTH_ERROR", "NETWORK_ERROR", "TIMEOUT", "UNKNOWN"]);
const CAM_STATUS = new Set(["ONLINE", "OFFLINE", "VIDEO_LOSS", "NO_RECORDING", "STREAM_ERROR", "AUTH_ERROR", "NETWORK_ERROR", "DEGRADED", "UNKNOWN"]);
const REC_STATUS = new Set(["RECORDING", "NOT_RECORDING", "NO_RECORDING_FOUND", "UNKNOWN"]);
const STO_STATUS = new Set(["NORMAL", "WARNING", "CRITICAL", "FAILED", "UNKNOWN"]);
const MAX_RECORDERS = 1000;

const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bigOrNull = (v: unknown): bigint | null => {
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.round(v));
  if (typeof v === "string" && /^\d+$/.test(v)) return BigInt(v);
  return null;
};
const dateOrNull = (v: unknown): Date | null => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);

export async function POST(req: Request) {
  const auth = await resolveIngestOrg(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const orgId = auth.orgId;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const recorders = (body as { recorders?: unknown[] }).recorders;
  if (!Array.isArray(recorders)) return NextResponse.json({ error: "recorders_required" }, { status: 400 });
  if (recorders.length > MAX_RECORDERS) return NextResponse.json({ error: "too_many_recorders" }, { status: 400 });

  const now = new Date();
  let recordersMatched = 0, camerasUpserted = 0, incidentsOpened = 0, incidentsClosed = 0;
  const errors: { serial: string; error: string }[] = [];

  for (const raw of recorders) {
    const r = raw as Record<string, unknown>;
    const serial = str(r.serial, 100);
    if (!serial) { errors.push({ serial: "(blank)", error: "serial required" }); continue; }

    const rec = await prisma.cctvRecorder.findUnique({
      where: { organizationId_serial: { organizationId: orgId, serial } },
      select: { id: true, status: true },
    });
    if (!rec) { errors.push({ serial, error: "unknown recorder (import device.xml first)" }); continue; }
    recordersMatched++;

    const devStatus = DEV_STATUS.has(str(r.status).toUpperCase()) ? str(r.status).toUpperCase() : "UNKNOWN";
    const isOnline = devStatus === "ONLINE";
    try {
      await prisma.cctvRecorder.update({
        where: { id: rec.id },
        data: {
          status: devStatus as never,
          model: str(r.model, 200) || undefined,
          firmware: str(r.firmware, 100) || undefined,
          deviceType: str(r.deviceType, 100) || undefined,
          channelCount: num(r.channelCount) ?? undefined,
          localIp: str(r.localIp, 100) || undefined,
          capabilities: (r.capabilities && typeof r.capabilities === "object" ? r.capabilities : undefined) as never,
          errorMessage: str(r.errorMessage, 500) || null,
          lastSeenAt: now,
          lastOnlineAt: isOnline ? now : undefined,
          offlineSince: isOnline ? null : (rec.status === "OFFLINE" ? undefined : now),
          failureCount: isOnline ? 0 : { increment: 1 },
          recheckRequestedAt: null, // a fresh push satisfies any pending "Check Now"
        },
      });

      await prisma.cctvHealthLog.create({
        data: { organizationId: orgId, recorderId: rec.id, checkedAt: now, deviceStatus: devStatus as never, errorMessage: str(r.errorMessage, 500) || null },
      });

      // Recorder-offline incident dedup
      await reconcileIncident(orgId, { recorderId: rec.id, type: "RECORDER_OFFLINE", bad: !isOnline && devStatus !== "UNKNOWN", severity: "CRITICAL", title: `Recorder offline: ${serial}` }, now, (o) => { incidentsOpened += o; }, (c) => { incidentsClosed += c; });

      // Cameras
      const cams = Array.isArray(r.cameras) ? r.cameras : [];
      for (const rawC of cams) {
        const c = rawC as Record<string, unknown>;
        const channel = num(c.channel);
        if (channel == null) continue;
        const camStatus = CAM_STATUS.has(str(c.status).toUpperCase()) ? str(c.status).toUpperCase() : "UNKNOWN";
        const recStatus = REC_STATUS.has(str(c.recordingStatus).toUpperCase()) ? str(c.recordingStatus).toUpperCase() : "UNKNOWN";
        const snap = (c.snapshot && typeof c.snapshot === "object") ? c.snapshot as Record<string, unknown> : {};
        const camOnline = camStatus === "ONLINE";
        const data = {
          name: str(c.name, 200) || undefined,
          status: camStatus as never,
          streamStatus: str(c.streamStatus, 100) || null,
          recordingStatus: recStatus as never,
          latestRecordingAt: dateOrNull(c.latestRecording),
          earliestRecordingAt: dateOrNull(c.earliestRecording),
          recordingGapSeconds: num(c.recordingGapSeconds),
          retentionDays: num(c.retentionDays),
          retentionEstimated: c.retentionEstimated === true,
          lastSnapshotAt: str(snap.path) || snap.status ? now : undefined,
          lastSnapshotPath: str(snap.path, 500) || undefined,
          lastSnapshotW: num(snap.w) ?? undefined,
          lastSnapshotH: num(snap.h) ?? undefined,
          lastOnlineAt: camOnline ? now : undefined,
        };
        const cam = await prisma.cctvCamera.upsert({
          where: { recorderId_channel: { recorderId: rec.id, channel } },
          create: { organizationId: orgId, recorderId: rec.id, channel, offlineSince: camOnline ? null : now, ...data },
          update: { ...data, offlineSince: camOnline ? null : undefined },
          select: { id: true },
        });
        camerasUpserted++;

        await prisma.cctvHealthLog.create({
          data: {
            organizationId: orgId, recorderId: rec.id, cameraId: cam.id, checkedAt: now,
            cameraStatus: camStatus as never, recordingStatus: recStatus as never,
            latestRecordingAt: dateOrNull(c.latestRecording), recordingGapSeconds: num(c.recordingGapSeconds),
            snapshotStatus: str(snap.status, 50) || null, snapshotPath: str(snap.path, 500) || null,
          },
        });

        await reconcileIncident(orgId, { recorderId: rec.id, cameraId: cam.id, type: "CAMERA_OFFLINE", bad: camStatus === "OFFLINE" || camStatus === "VIDEO_LOSS", severity: "WARNING", title: `Camera issue ch${channel}: ${camStatus}` }, now, (o) => { incidentsOpened += o; }, (c2) => { incidentsClosed += c2; });
      }

      // Storage
      const stor = Array.isArray(r.storage) ? r.storage : [];
      for (const rawS of stor) {
        const s = rawS as Record<string, unknown>;
        const hddIndex = num(s.hddIndex);
        if (hddIndex == null) continue;
        await prisma.cctvStorageLog.create({
          data: {
            organizationId: orgId, recorderId: rec.id, checkedAt: now, hddIndex,
            hddModel: str(s.model, 200) || null,
            status: (STO_STATUS.has(str(s.status).toUpperCase()) ? str(s.status).toUpperCase() : "UNKNOWN") as never,
            capacityBytes: bigOrNull(s.capacityBytes), usedBytes: bigOrNull(s.usedBytes), freeBytes: bigOrNull(s.freeBytes),
            temperatureC: num(s.temperatureC), smartStatus: str(s.smartStatus, 100) || null,
          },
        });
      }
    } catch (e) {
      errors.push({ serial, error: (e as Error).message.slice(0, 120) });
    }
  }

  await prisma.auditLog.create({
    data: { organizationId: orgId, action: "IMPORT", entityType: "CCTV_HEALTH", detail: { via: "cctv-ingest", recordersMatched, camerasUpserted, incidentsOpened, incidentsClosed, failed: errors.length } },
  }).catch(() => {});

  return NextResponse.json({ recordersMatched, camerasUpserted, incidentsOpened, incidentsClosed, failed: errors.length, errors: errors.slice(0, 100) });
}

/** Open an incident when a condition first goes bad; close the open one when it recovers. */
async function reconcileIncident(
  orgId: string,
  o: { recorderId?: string; cameraId?: string; type: string; bad: boolean; severity: string; title: string },
  now: Date,
  onOpen: (n: number) => void,
  onClose: (n: number) => void,
) {
  const open = await prisma.cctvIncident.findFirst({
    where: {
      organizationId: orgId, type: o.type as never, status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] },
      recorderId: o.recorderId ?? null, cameraId: o.cameraId ?? null,
    },
    select: { id: true, startedAt: true },
  });
  if (o.bad && !open) {
    await prisma.cctvIncident.create({
      data: {
        organizationId: orgId, recorderId: o.recorderId ?? null, cameraId: o.cameraId ?? null,
        type: o.type as never, severity: o.severity as never, status: "OPEN", title: o.title, startedAt: now, detectedAt: now,
      },
    });
    onOpen(1);
  } else if (!o.bad && open) {
    const downtime = Math.max(0, Math.round((now.getTime() - open.startedAt.getTime()) / 60000));
    await prisma.cctvIncident.update({
      where: { id: open.id },
      data: { status: "RESOLVED", resolvedAt: now, downtimeMinutes: downtime, resolution: "Auto-recovered (observed healthy by collector)" },
    });
    onClose(1);
  }
}
