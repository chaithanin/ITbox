import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requirePermission, AuthError } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";

/** Download an asset document (org-scoped, authenticated). */
export const GET = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requirePermission("asset:read");
    const { id } = await ctx.params;
    const doc = await prisma.assetDocument.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    });
    if (!doc) throw new AuthError("NOT_FOUND", 404);

    const data = await getStorageProvider().get(doc.storagePath);
    const isImage = (doc.contentType ?? "").startsWith("image/");
    const asciiName = doc.name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": doc.contentType ?? "application/octet-stream",
        "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
);
