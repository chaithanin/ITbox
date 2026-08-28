import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requirePermission, AuthError } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** Serve a camera's latest stored snapshot JPEG (org-scoped, cctv:view). */
export const GET = apiHandler(async (_req: Request, ctx: { params: Promise<{ cameraId: string }> }) => {
  const user = await requirePermission("cctv:view");
  const { cameraId } = await ctx.params;
  const cam = await prisma.cctvCamera.findFirst({
    where: { id: cameraId, organizationId: user.organizationId },
    select: { snapshotObjectKey: true },
  });
  if (!cam?.snapshotObjectKey) throw new AuthError("NOT_FOUND", 404);

  const data = await getStorageProvider().get(cam.snapshotObjectKey);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
