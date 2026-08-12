import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requirePermission, AuthError } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getVaultAccess, deleteVaultItem } from "@/lib/services/vault";

/** GET /api/vault/:id — metadata only (no ciphertext, no secrets). */
export const GET = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requirePermission("vault:read");
    const { id } = await ctx.params;
    const item = await prisma.vaultItem.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: {
        id: true, name: true, type: true, classification: true, environment: true,
        username: true, url: true, host: true, port: true, protocol: true,
        tags: true, notes: true, rotationDays: true, lastRotatedAt: true,
        nextRotationAt: true, expiresAt: true, requireMfaToReveal: true,
        requireApprovalToReveal: true, createdAt: true, updatedAt: true,
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        assetLinks: { select: { assetId: true, label: true } },
      },
    });
    if (!item) throw new AuthError("NOT_FOUND", 404);
    const full = await prisma.vaultItem.findUniqueOrThrow({ where: { id } });
    const access = await getVaultAccess(user, full);
    if (access.level < 1) throw new AuthError("NOT_FOUND", 404);
    return NextResponse.json({ data: item, accessLevel: access.level });
  }
);

export const DELETE = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const user = await requirePermission("vault:delete");
    const { id } = await ctx.params;
    await deleteVaultItem(user, id);
    return NextResponse.json({ ok: true });
  }
);
