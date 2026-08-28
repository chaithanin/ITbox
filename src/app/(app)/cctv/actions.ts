"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { parseDeviceXml, importRecordersFromXml } from "@/lib/services/cctv";

const MAX_XML_BYTES = 1 * 1024 * 1024; // 1 MB

/** Import a Dahua device.xml (uploaded by an admin) into the CCTV device master. */
export async function importDeviceXml(formData: FormData) {
  const user = await requirePermission("cctv:manage");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/cctv/import?error=nofile");
  const f = file as File;
  if (f.size > MAX_XML_BYTES) redirect("/cctv/import?error=toolarge");

  const text = await f.text();
  const devices = parseDeviceXml(text);
  if (devices.length === 0) redirect("/cctv/import?error=empty");

  const result = await importRecordersFromXml(user.organizationId, devices);
  // Never log credentials — only counts.
  await auditLog(user, {
    action: "IMPORT",
    entityType: "CCTV_RECORDER",
    detail: { total: result.total, created: result.created, updated: result.updated, linkedAssets: result.linkedAssets, failed: result.errors.length },
  });
  revalidatePath("/cctv");
  revalidatePath("/cctv/devices");
  redirect(`/cctv/devices?imported=${result.created}&updated=${result.updated}&linked=${result.linkedAssets}`);
}

/** Acknowledge or resolve a CCTV incident. */
const incidentSchema = z.object({
  incidentId: z.string().uuid(),
  op: z.enum(["ack", "resolve"]),
  responsiblePerson: z.string().max(200).optional(),
  resolution: z.string().max(2000).optional(),
});

export async function updateCctvIncident(formData: FormData) {
  const user = await requirePermission("cctv:manage");
  const i = incidentSchema.parse(Object.fromEntries(formData));
  const incident = await prisma.cctvIncident.findFirst({
    where: { id: i.incidentId, organizationId: user.organizationId },
    select: { id: true, startedAt: true, status: true },
  });
  if (!incident) redirect("/cctv/incidents?error=notfound");
  const now = new Date();

  if (i.op === "ack") {
    await prisma.cctvIncident.update({
      where: { id: incident.id },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: now, responsiblePerson: i.responsiblePerson || undefined },
    });
  } else {
    const downtime = Math.max(0, Math.round((now.getTime() - incident.startedAt.getTime()) / 60000));
    await prisma.cctvIncident.update({
      where: { id: incident.id },
      data: { status: "RESOLVED", resolvedAt: now, downtimeMinutes: downtime, resolution: i.resolution || "แก้ไขโดยเจ้าหน้าที่ / Resolved manually" },
    });
  }
  await auditLog(user, { action: "UPDATE", entityType: "CCTV_INCIDENT", entityId: incident.id, detail: { op: i.op } });
  revalidatePath("/cctv/incidents");
  redirect("/cctv/incidents?updated=1");
}
