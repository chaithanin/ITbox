"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireUser } from "@/lib/session";
import {
  createVaultItem,
  updateVaultItem,
  deleteVaultItem,
  shareVaultItem,
  revokeVaultShare,
  markRotation,
  requestEmergencyAccess,
  decideEmergencyAccess,
  type SecretPayload,
} from "@/lib/services/vault";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const itemSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum([
    "PASSWORD", "SERVER", "DATABASE", "API_KEY", "SSH_KEY", "WIFI",
    "NETWORK_DEVICE", "CERTIFICATE", "LICENSE_KEY", "TOKEN", "OTHER",
  ]),
  classification: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  categoryId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
  departmentId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
  environment: z.preprocess(emptyToNull, z.string().max(50).nullable()),
  url: z.preprocess(emptyToNull, z.string().max(500).nullable()),
  host: z.preprocess(emptyToNull, z.string().max(200).nullable()),
  port: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(65535).nullable()),
  protocol: z.preprocess(emptyToNull, z.string().max(50).nullable()),
  username: z.preprocess(emptyToNull, z.string().max(200).nullable()),
  tags: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.split(",").map((s) => s.trim()) : []),
    z.array(z.string().max(50)).max(20)
  ),
  notes: z.preprocess(emptyToNull, z.string().max(2000).nullable()),
  rotationDays: z.preprocess(emptyToNull, z.coerce.number().int().min(1).max(3650).nullable()),
  expiresAt: z.preprocess(
    (v) => (v === "" || v === undefined ? null : new Date(String(v))),
    z.date().nullable()
  ),
  requireMfaToReveal: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  requireApprovalToReveal: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  // secret fields
  password: z.string().max(4096).optional(),
  apiKey: z.string().max(4096).optional(),
  token: z.string().max(8192).optional(),
  sshPrivateKey: z.string().max(16384).optional(),
  sshPublicKey: z.string().max(8192).optional(),
  certificate: z.string().max(32768).optional(),
  extra: z.string().max(8192).optional(),
});

function extractSecret(input: z.infer<typeof itemSchema>): SecretPayload {
  const secret: SecretPayload = {};
  for (const k of ["password", "apiKey", "token", "sshPrivateKey", "sshPublicKey", "certificate", "extra"] as const) {
    if (input[k]) secret[k] = input[k];
  }
  return secret;
}

export async function createSecretAction(formData: FormData) {
  const user = await requirePermission("vault:create");
  const input = itemSchema.parse(Object.fromEntries(formData));
  const item = await createVaultItem(user, { ...input, secret: extractSecret(input) });
  revalidatePath("/vault");
  redirect(`/vault/${item.id}`);
}

export async function updateSecretAction(id: string, formData: FormData) {
  const user = await requirePermission("vault:update");
  const input = itemSchema.parse(Object.fromEntries(formData));
  const secret = extractSecret(input);
  await updateVaultItem(user, id, {
    ...input,
    // Only re-encrypt when a secret field was actually provided;
    // empty form = keep existing secret unchanged.
    secret: Object.keys(secret).length > 0 ? secret : undefined,
  });
  revalidatePath(`/vault/${id}`);
  redirect(`/vault/${id}`);
}

export async function deleteSecretAction(id: string) {
  const user = await requirePermission("vault:delete");
  await deleteVaultItem(user, id);
  revalidatePath("/vault");
  redirect("/vault");
}

export async function toggleFavoriteAction(id: string) {
  const user = await requirePermission("vault:read");
  const existing = await prisma.vaultFavorite.findUnique({
    where: { userId_vaultItemId: { userId: user.id, vaultItemId: id } },
  });
  if (existing) {
    await prisma.vaultFavorite.delete({
      where: { userId_vaultItemId: { userId: user.id, vaultItemId: id } },
    });
  } else {
    // Verify visibility before favoriting (item must exist in caller's org)
    const item = await prisma.vaultItem.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!item) return;
    await prisma.vaultFavorite.create({ data: { userId: user.id, vaultItemId: id } });
  }
  revalidatePath(`/vault/${id}`);
  revalidatePath("/vault/favorites");
}

const shareSchema = z.object({
  targetType: z.enum(["user", "role", "department"]),
  targetId: z.string().uuid(),
  permission: z.enum(["VIEW", "REVEAL", "COPY", "EDIT", "SHARE"]),
  expiresIn: z.enum(["1h", "1d", "7d", "30d", "never", "custom"]),
  customExpiry: z.string().optional(),
  startsAt: z.string().optional(),
  reason: z.string().max(500).optional(),
});

const EXPIRY_MS: Record<string, number | null> = {
  "1h": 3_600_000,
  "1d": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
  never: null,
};

export async function shareSecretAction(id: string, formData: FormData) {
  const user = await requirePermission("vault:share");
  const input = shareSchema.parse(Object.fromEntries(formData));
  let expiresAt: Date | null = null;
  if (input.expiresIn === "custom" && input.customExpiry) {
    expiresAt = new Date(input.customExpiry);
  } else {
    const ms = EXPIRY_MS[input.expiresIn];
    expiresAt = ms ? new Date(Date.now() + ms) : null;
  }
  // Resolve target kind by looking the id up (org-scoped) — robust against
  // a mismatched targetType coming from the combined select in the UI.
  const [targetUser, targetRole, targetDept] = await Promise.all([
    prisma.user.findFirst({
      where: { id: input.targetId, organizationId: user.organizationId },
      select: { id: true },
    }),
    prisma.role.findFirst({
      where: { id: input.targetId, organizationId: user.organizationId },
      select: { id: true },
    }),
    prisma.department.findFirst({
      where: { id: input.targetId, organizationId: user.organizationId },
      select: { id: true },
    }),
  ]);
  await shareVaultItem(user, id, {
    userId: targetUser?.id,
    roleId: targetRole?.id,
    departmentId: targetDept?.id,
    permission: input.permission,
    expiresAt,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    reason: input.reason,
  });
  revalidatePath(`/vault/${id}`);
}

export async function revokeShareAction(itemId: string, shareId: string) {
  const user = await requirePermission("vault:share");
  await revokeVaultShare(user, shareId);
  revalidatePath(`/vault/${itemId}`);
}

export async function markRotationAction(id: string, formData: FormData) {
  const user = await requirePermission("vault:rotate");
  const status = z.enum(["ROTATED", "VERIFIED", "SKIPPED"]).parse(formData.get("status"));
  const reason = z.string().max(500).optional().parse(formData.get("reason") ?? undefined);
  const newPassword = formData.get("newPassword");
  await markRotation(
    user,
    id,
    status,
    reason,
    typeof newPassword === "string" && newPassword.length > 0
      ? { password: newPassword }
      : undefined
  );
  revalidatePath(`/vault/${id}`);
  revalidatePath("/vault/rotation");
}

export async function linkAssetAction(itemId: string, formData: FormData) {
  const user = await requirePermission("vault:update");
  const assetId = z.string().uuid().parse(formData.get("assetId"));
  const label = z.string().max(100).optional().parse(formData.get("label") || undefined);
  // Both sides must belong to the caller's organization
  const [item, asset] = await Promise.all([
    prisma.vaultItem.findFirst({
      where: { id: itemId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    }),
    prisma.asset.findFirst({
      where: { id: assetId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    }),
  ]);
  if (!item || !asset) return;
  await prisma.assetVaultLink.upsert({
    where: { assetId_vaultItemId: { assetId, vaultItemId: itemId } },
    update: { label: label ?? null },
    create: { assetId, vaultItemId: itemId, label: label ?? null },
  });
  revalidatePath(`/vault/${itemId}`);
  revalidatePath(`/assets/${assetId}`);
}

export async function unlinkAssetAction(itemId: string, assetId: string) {
  const user = await requirePermission("vault:update");
  const item = await prisma.vaultItem.findFirst({
    where: { id: itemId, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!item) return;
  await prisma.assetVaultLink.deleteMany({
    where: { assetId, vaultItemId: itemId },
  });
  revalidatePath(`/vault/${itemId}`);
  revalidatePath(`/assets/${assetId}`);
}

export async function requestEmergencyAction(formData: FormData) {
  const user = await requireUser();
  const vaultItemId = z.string().uuid().parse(formData.get("vaultItemId"));
  const reason = z.string().min(5).max(1000).parse(formData.get("reason"));
  await requestEmergencyAccess(user, vaultItemId, reason);
  revalidatePath("/vault/emergency");
  redirect("/vault/emergency");
}

export async function decideEmergencyAction(requestId: string, formData: FormData) {
  const user = await requirePermission("vault:emergency");
  const decision = z.enum(["APPROVED", "REJECTED"]).parse(formData.get("decision"));
  const hours = z.coerce.number().int().min(1).max(72).default(2).parse(formData.get("hours") || 2);
  await decideEmergencyAccess(user, requestId, decision, hours);
  revalidatePath("/vault/emergency");
}
