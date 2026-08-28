import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requirePermission, AuthError } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getStorageProvider,
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  verifyMagicBytes,
} from "@/lib/storage";

/**
 * Attach evidence (photo/screenshot/PDF) to an IT health check.
 * POST multipart/form-data with one or more `file` fields.
 */
export const POST = apiHandler(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requirePermission("support:work");
    const { id } = await ctx.params;

    const check = await prisma.itHealthCheck.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!check) throw new AuthError("NOT_FOUND", 404);

    const form = await req.formData();
    const files = form
      .getAll("file")
      .filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) throw new AuthError("NO_FILE", 400);

    const storage = getStorageProvider();
    const created: { id: string; name: string }[] = [];

    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) throw new AuthError("FILE_TOO_LARGE", 400);
      const ext = ALLOWED_UPLOAD_TYPES[file.type];
      if (!ext) throw new AuthError("UNSUPPORTED_FILE_TYPE", 400);
      const buffer = Buffer.from(await file.arrayBuffer());
      if (!verifyMagicBytes(buffer, file.type)) throw new AuthError("FILE_CONTENT_MISMATCH", 400);
      const objectPath = `${user.organizationId}/it-health/${check.id}/${crypto.randomUUID()}.${ext}`;
      await storage.put(objectPath, buffer, file.type);
      const row = await prisma.itHealthEvidence.create({
        data: {
          organizationId: user.organizationId,
          checkId: check.id,
          name: file.name.slice(0, 200).replace(/[\r\n]/g, " ") || `file.${ext}`,
          storagePath: objectPath,
          contentType: file.type,
          sizeBytes: file.size,
          uploadedById: user.id,
        },
        select: { id: true, name: true },
      });
      created.push(row);
    }

    return NextResponse.json({ ok: true, uploaded: created });
  }
);
