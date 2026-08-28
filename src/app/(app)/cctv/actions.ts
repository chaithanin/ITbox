"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
