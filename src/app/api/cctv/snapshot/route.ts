import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveIngestOrg } from "@/lib/ingest-auth";
import { getStorageProvider, verifyMagicBytes } from "@/lib/storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB per snapshot

/**
 * CCTV snapshot upload (push). The collector POSTs one camera's latest JPEG as
 * multipart/form-data (fields: serial, channel, file). Authenticated by the org
 * collector API key. The image is validated (JPEG magic bytes) and stored via the
 * storage layer; the camera's latest-snapshot pointer is updated. One object per
 * camera is kept (overwritten) — history lives in the health log, not blobs.
 */
export async function POST(req: Request) {
  const auth = await resolveIngestOrg(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const orgId = auth.orgId;

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "invalid_form" }, { status: 400 }); }
  const serial = String(form.get("serial") ?? "").trim();
  const channel = Number(form.get("channel"));
  const file = form.get("file");
  if (!serial || !Number.isInteger(channel)) return NextResponse.json({ error: "serial_and_channel_required" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "file_required" }, { status: 400 });
  if (file.size === 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "bad_file_size" }, { status: 400 });

  const rec = await prisma.cctvRecorder.findUnique({
    where: { organizationId_serial: { organizationId: orgId, serial } },
    select: { id: true },
  });
  if (!rec) return NextResponse.json({ error: "unknown_recorder" }, { status: 404 });
  const cam = await prisma.cctvCamera.findUnique({
    where: { recorderId_channel: { recorderId: rec.id, channel } },
    select: { id: true },
  });
  if (!cam) return NextResponse.json({ error: "unknown_camera" }, { status: 404 });

  const buf = Buffer.from(await file.arrayBuffer());
  if (!verifyMagicBytes(buf, "image/jpeg")) return NextResponse.json({ error: "not_a_jpeg" }, { status: 400 });

  const objectKey = `cctv/${orgId}/${serial}/ch${channel}.jpg`;
  try {
    await getStorageProvider().put(objectKey, buf, "image/jpeg");
  } catch {
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }

  await prisma.cctvCamera.update({
    where: { id: cam.id },
    data: { snapshotObjectKey: objectKey, lastSnapshotAt: new Date() },
  });

  return NextResponse.json({ ok: true, cameraId: cam.id });
}
