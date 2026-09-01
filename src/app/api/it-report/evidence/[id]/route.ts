import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requirePermission, AuthError } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { revalidatePath } from "next/cache";

/** Download one piece of IT health-check evidence (org-scoped). */
export const GET = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    // FILE-002: gate reads on support:read (was authentication-only), matching
    // the upload/delete permission on the same resource.
    const user = await requirePermission("support:read");
    const { id } = await ctx.params;

    const ev = await prisma.itHealthEvidence.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!ev) throw new AuthError("NOT_FOUND", 404);

    const data = await getStorageProvider().get(ev.storagePath);
    const isImage = (ev.contentType ?? "").startsWith("image/");
    const asciiName = ev.name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": ev.contentType ?? "application/octet-stream",
        "Content-Disposition": `${isImage ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(ev.name)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
);

/** Delete one piece of evidence (removes stored object + row). */
export const DELETE = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requirePermission("support:work");
    const { id } = await ctx.params;

    const ev = await prisma.itHealthEvidence.findFirst({
      where: { id, organizationId: user.organizationId },
    });
    if (!ev) throw new AuthError("NOT_FOUND", 404);

    await getStorageProvider().delete(ev.storagePath).catch(() => {});
    await prisma.itHealthEvidence.delete({ where: { id: ev.id } });
    revalidatePath("/it-report");
    return NextResponse.json({ ok: true });
  }
);
