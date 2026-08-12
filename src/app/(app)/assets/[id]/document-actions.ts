"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { AuthError } from "@/lib/errors";
import {
  getStorageProvider, ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES,
} from "@/lib/storage";

const DOC_TYPES = ["INVOICE", "WARRANTY", "MANUAL", "PHOTO", "OTHER"] as const;

export async function uploadAssetDocumentAction(assetId: string, formData: FormData) {
  const user = await requirePermission("asset:update");
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, assetTag: true },
  });
  if (!asset) throw new AuthError("NOT_FOUND", 404);

  const file = formData.get("file");
  const docType = z.enum(DOC_TYPES).catch("OTHER").parse(formData.get("docType"));
  const setAsImage = formData.get("setAsImage") === "on";
  if (!(file instanceof File) || file.size === 0) throw new AuthError("NO_FILE", 400);
  if (file.size > MAX_UPLOAD_BYTES) throw new AuthError("FILE_TOO_LARGE", 400);
  const ext = ALLOWED_UPLOAD_TYPES[file.type];
  if (!ext) throw new AuthError("UNSUPPORTED_FILE_TYPE", 400);
  if (setAsImage && !["png", "jpg", "webp"].includes(ext)) {
    throw new AuthError("IMAGE_TYPE_REQUIRED", 400);
  }

  // Server-generated object path — user input never becomes a path
  const objectPath = `${user.organizationId}/assets/${asset.id}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await getStorageProvider().put(objectPath, buffer, file.type);

  const safeName = file.name.slice(0, 200).replace(/[\r\n]/g, " ");
  const doc = await prisma.assetDocument.create({
    data: {
      organizationId: user.organizationId,
      assetId: asset.id,
      name: safeName || `document.${ext}`,
      type: setAsImage ? "PHOTO" : docType,
      storagePath: objectPath,
      contentType: file.type,
      sizeBytes: file.size,
      uploadedById: user.id,
    },
  });
  if (setAsImage) {
    await prisma.asset.update({
      where: { id: asset.id },
      data: { imageUrl: `/api/documents/${doc.id}` },
    });
  }
  await auditLog(user, {
    action: "UPLOAD",
    entityType: "ASSET_DOCUMENT",
    entityId: doc.id,
    detail: { assetTag: asset.assetTag, name: doc.name, sizeBytes: file.size },
  });
  revalidatePath(`/assets/${asset.id}`);
}

export async function deleteAssetDocumentAction(assetId: string, documentId: string) {
  const user = await requirePermission("asset:update");
  const doc = await prisma.assetDocument.findFirst({
    where: {
      id: documentId,
      assetId,
      organizationId: user.organizationId,
      deletedAt: null,
    },
    include: { asset: { select: { imageUrl: true } } },
  });
  if (!doc) throw new AuthError("NOT_FOUND", 404);

  await prisma.assetDocument.update({
    where: { id: doc.id },
    data: { deletedAt: new Date() },
  });
  if (doc.asset.imageUrl === `/api/documents/${doc.id}`) {
    await prisma.asset.update({ where: { id: assetId }, data: { imageUrl: null } });
  }
  // Best-effort object removal (row is the source of truth)
  try {
    await getStorageProvider().delete(doc.storagePath);
  } catch {
    // leave orphan for lifecycle policy cleanup
  }
  await auditLog(user, {
    action: "DELETE",
    entityType: "ASSET_DOCUMENT",
    entityId: doc.id,
    detail: { name: doc.name },
  });
  revalidatePath(`/assets/${assetId}`);
}
