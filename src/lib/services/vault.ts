/**
 * Vault service — every read/reveal/copy/share of a secret goes through here.
 *
 * Access chain for reveal (Section 14):
 *   authn → RBAC permission → per-item access level → MFA policy →
 *   approval policy → decrypt → audit. Decrypted values are returned to the
 *   caller once and never logged or persisted.
 */
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/envelope";
import { auditLog } from "@/lib/audit";
import { AuthError, type CurrentUser } from "@/lib/session";
import { verifyTotp } from "@/lib/mfa";
import type { Prisma, VaultItem, VaultPermissionLevel } from "@prisma/client";

const LEVEL_ORDER: Record<VaultPermissionLevel, number> = {
  VIEW: 1,
  REVEAL: 2,
  COPY: 3,
  EDIT: 4,
  SHARE: 5,
};

/** Secret payload shape stored encrypted as JSON. */
export interface SecretPayload {
  password?: string;
  apiKey?: string;
  token?: string;
  sshPrivateKey?: string;
  sshPublicKey?: string;
  certificate?: string;
  extra?: string;
}

export interface VaultAccessContext {
  level: number; // 0 = no access
  isOwner: boolean;
  viaManage: boolean;
}

/** Prisma where-clause limiting vault items to those visible to the user. */
export async function vaultVisibilityWhere(
  user: CurrentUser
): Promise<Prisma.VaultItemWhereInput> {
  const base: Prisma.VaultItemWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
  };
  if (user.permissions.has("vault:manage")) return base;

  const employee = user.employeeId
    ? await prisma.employee.findUnique({
        where: { id: user.employeeId },
        select: { departmentId: true },
      })
    : null;

  const now = new Date();
  const activeShare: Prisma.VaultShareWhereInput = {
    revokedAt: null,
    startsAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  return {
    ...base,
    OR: [
      { ownerId: user.id },
      { createdById: user.id },
      { shares: { some: { ...activeShare, userId: user.id } } },
      ...(user.roles.length
        ? [{ shares: { some: { ...activeShare, role: { key: { in: user.roles } } } } }]
        : []),
      ...(employee?.departmentId
        ? [{ shares: { some: { ...activeShare, departmentId: employee.departmentId } } }]
        : []),
    ],
  };
}

/** Resolve the caller's effective access level on one item. */
export async function getVaultAccess(
  user: CurrentUser,
  item: VaultItem
): Promise<VaultAccessContext> {
  if (item.organizationId !== user.organizationId) {
    return { level: 0, isOwner: false, viaManage: false };
  }
  if (item.ownerId === user.id || item.createdById === user.id) {
    return { level: LEVEL_ORDER.SHARE, isOwner: true, viaManage: false };
  }
  if (user.permissions.has("vault:manage")) {
    return { level: LEVEL_ORDER.SHARE, isOwner: false, viaManage: true };
  }
  const employee = user.employeeId
    ? await prisma.employee.findUnique({
        where: { id: user.employeeId },
        select: { departmentId: true },
      })
    : null;
  const now = new Date();
  const shares = await prisma.vaultShare.findMany({
    where: {
      vaultItemId: item.id,
      revokedAt: null,
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: { role: { select: { key: true } } },
  });
  let level = 0;
  for (const s of shares) {
    const matches =
      (s.userId && s.userId === user.id) ||
      (s.role && user.roles.includes(s.role.key)) ||
      (s.departmentId && employee?.departmentId === s.departmentId);
    if (matches) level = Math.max(level, LEVEL_ORDER[s.permission]);
  }
  return { level, isOwner: false, viaManage: false };
}

async function getItemOrThrow(user: CurrentUser, id: string): Promise<VaultItem> {
  const item = await prisma.vaultItem.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!item) throw new AuthError("NOT_FOUND", 404);
  return item;
}

function classificationRequiresMfa(item: VaultItem): boolean {
  return (
    item.requireMfaToReveal ||
    item.classification === "HIGH" ||
    item.classification === "CRITICAL"
  );
}

async function verifyMfaIfRequired(
  user: CurrentUser,
  item: VaultItem,
  mfaCode: string | undefined,
  action: string
): Promise<void> {
  if (!classificationRequiresMfa(item)) return;
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.mfaEnabled) {
    // Policy: sensitive secrets require the account itself to have MFA.
    await logAccess(user, item, action, "DENIED", "MFA_NOT_ENROLLED");
    throw new AuthError("MFA_ENROLLMENT_REQUIRED", 403);
  }
  if (!mfaCode) {
    throw new AuthError("MFA_REQUIRED", 403);
  }
  const ok = await verifyTotp(dbUser, mfaCode);
  if (!ok) {
    await logAccess(user, item, action, "DENIED", "MFA_INVALID");
    throw new AuthError("MFA_INVALID", 403);
  }
}

async function checkApprovalIfRequired(
  user: CurrentUser,
  item: VaultItem,
  action: string
): Promise<void> {
  if (!item.requireApprovalToReveal) return;
  // An APPROVED, unexpired emergency/access request lets the requester through.
  const now = new Date();
  const approved = await prisma.vaultEmergencyRequest.findFirst({
    where: {
      vaultItemId: item.id,
      requesterId: user.id,
      status: "APPROVED",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  if (!approved) {
    await logAccess(user, item, action, "DENIED", "APPROVAL_REQUIRED");
    throw new AuthError("APPROVAL_REQUIRED", 403);
  }
}

async function logAccess(
  user: CurrentUser,
  item: VaultItem,
  action: string,
  result: "SUCCESS" | "DENIED",
  reason?: string
): Promise<void> {
  await prisma.vaultAccessLog.create({
    data: {
      organizationId: user.organizationId,
      vaultItemId: item.id,
      userId: user.id,
      action,
      result,
      reason,
      ip: user.ip,
      userAgent: user.userAgent,
    },
  });
  await auditLog(user, {
    action,
    entityType: "VAULT_ITEM",
    entityId: item.id,
    result,
    detail: { name: item.name, classification: item.classification, reason },
  });
}

// ---------------- CRUD ----------------

export interface VaultItemInput {
  name: string;
  type: VaultItem["type"];
  classification: VaultItem["classification"];
  categoryId?: string | null;
  departmentId?: string | null;
  environment?: string | null;
  url?: string | null;
  host?: string | null;
  port?: number | null;
  protocol?: string | null;
  username?: string | null;
  tags?: string[];
  notes?: string | null;
  rotationDays?: number | null;
  expiresAt?: Date | null;
  requireMfaToReveal?: boolean;
  requireApprovalToReveal?: boolean;
  secret: SecretPayload;
}

export async function createVaultItem(user: CurrentUser, input: VaultItemInput) {
  if (!user.permissions.has("vault:create")) throw new AuthError("FORBIDDEN", 403);
  const enc = await encryptSecret(JSON.stringify(input.secret));
  const nextRotationAt = input.rotationDays
    ? new Date(Date.now() + input.rotationDays * 86_400_000)
    : null;
  const item = await prisma.vaultItem.create({
    data: {
      organizationId: user.organizationId,
      name: input.name,
      type: input.type,
      classification: input.classification,
      categoryId: input.categoryId ?? null,
      departmentId: input.departmentId ?? null,
      environment: input.environment ?? null,
      url: input.url ?? null,
      host: input.host ?? null,
      port: input.port ?? null,
      protocol: input.protocol ?? null,
      username: input.username ?? null,
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      rotationDays: input.rotationDays ?? null,
      nextRotationAt,
      expiresAt: input.expiresAt ?? null,
      requireMfaToReveal: input.requireMfaToReveal ?? false,
      requireApprovalToReveal: input.requireApprovalToReveal ?? false,
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      dekEnc: enc.dekEnc,
      kmsKeyVersion: enc.kmsKeyVersion,
      ownerId: user.id,
      createdById: user.id,
      updatedById: user.id,
      lastRotatedAt: new Date(),
    },
  });
  await logAccess(user, item, "CREATE_SECRET", "SUCCESS");
  return item;
}

export async function updateVaultItem(
  user: CurrentUser,
  id: string,
  input: Partial<VaultItemInput>
) {
  const item = await getItemOrThrow(user, id);
  const access = await getVaultAccess(user, item);
  if (access.level < LEVEL_ORDER.EDIT || !user.permissions.has("vault:update")) {
    await logAccess(user, item, "UPDATE_SECRET", "DENIED", "NO_ACCESS");
    throw new AuthError("FORBIDDEN", 403);
  }
  const data: Prisma.VaultItemUpdateInput = {
    updatedBy: undefined,
    updatedById: user.id,
  } as Prisma.VaultItemUpdateInput;
  for (const k of [
    "name", "type", "classification", "environment", "url", "host", "port",
    "protocol", "username", "notes", "rotationDays",
    "requireMfaToReveal", "requireApprovalToReveal",
  ] as const) {
    if (input[k] !== undefined) (data as Record<string, unknown>)[k] = input[k];
  }
  if (input.tags !== undefined) data.tags = input.tags;
  if (input.categoryId !== undefined)
    data.category = input.categoryId
      ? { connect: { id: input.categoryId } }
      : { disconnect: true };
  if (input.departmentId !== undefined)
    data.department = input.departmentId
      ? { connect: { id: input.departmentId } }
      : { disconnect: true };
  if (input.expiresAt !== undefined) data.expiresAt = input.expiresAt;
  if (input.rotationDays !== undefined) {
    data.nextRotationAt = input.rotationDays
      ? new Date(Date.now() + input.rotationDays * 86_400_000)
      : null;
  }
  if (input.secret !== undefined) {
    // Re-encrypt with a fresh DEK on every secret change
    const enc = await encryptSecret(JSON.stringify(input.secret));
    data.ciphertext = enc.ciphertext;
    data.iv = enc.iv;
    data.authTag = enc.authTag;
    data.dekEnc = enc.dekEnc;
    data.kmsKeyVersion = enc.kmsKeyVersion;
  }
  const updated = await prisma.vaultItem.update({ where: { id: item.id }, data });
  await logAccess(user, item, "UPDATE_SECRET", "SUCCESS");
  return updated;
}

export async function deleteVaultItem(user: CurrentUser, id: string) {
  const item = await getItemOrThrow(user, id);
  const access = await getVaultAccess(user, item);
  if (
    !(access.isOwner || access.viaManage) ||
    !user.permissions.has("vault:delete")
  ) {
    await logAccess(user, item, "DELETE_SECRET", "DENIED", "NO_ACCESS");
    throw new AuthError("FORBIDDEN", 403);
  }
  await prisma.vaultItem.update({
    where: { id: item.id },
    data: { deletedAt: new Date() },
  });
  await logAccess(user, item, "DELETE_SECRET", "SUCCESS");
}

// ---------------- Reveal / Copy ----------------

export async function revealVaultItem(
  user: CurrentUser,
  id: string,
  opts: { mfaCode?: string; reason?: string; action?: "REVEAL_SECRET" | "COPY_SECRET" }
): Promise<SecretPayload> {
  const action = opts.action ?? "REVEAL_SECRET";
  const item = await getItemOrThrow(user, id);

  const requiredLevel =
    action === "COPY_SECRET" ? LEVEL_ORDER.REVEAL : LEVEL_ORDER.REVEAL;
  const requiredPerm = action === "COPY_SECRET" ? "vault:copy" : "vault:reveal";

  if (!user.permissions.has(requiredPerm)) {
    await logAccess(user, item, action, "DENIED", "NO_RBAC_PERMISSION");
    throw new AuthError("FORBIDDEN", 403);
  }
  const access = await getVaultAccess(user, item);
  if (access.level < requiredLevel) {
    await logAccess(user, item, action, "DENIED", "NO_ITEM_ACCESS");
    throw new AuthError("FORBIDDEN", 403);
  }

  await verifyMfaIfRequired(user, item, opts.mfaCode, action);
  await checkApprovalIfRequired(user, item, action);

  const plaintext = await decryptSecret(item);
  await logAccess(user, item, action, "SUCCESS", opts.reason);

  return JSON.parse(plaintext) as SecretPayload;
}

// ---------------- Sharing ----------------

export async function shareVaultItem(
  user: CurrentUser,
  id: string,
  input: {
    userId?: string;
    roleId?: string;
    departmentId?: string;
    permission: VaultPermissionLevel;
    expiresAt?: Date | null;
    startsAt?: Date | null;
    reason?: string;
  }
) {
  const item = await getItemOrThrow(user, id);
  const access = await getVaultAccess(user, item);
  if (access.level < LEVEL_ORDER.SHARE || !user.permissions.has("vault:share")) {
    await logAccess(user, item, "SHARE_SECRET", "DENIED", "NO_ACCESS");
    throw new AuthError("FORBIDDEN", 403);
  }
  const targets = [input.userId, input.roleId, input.departmentId].filter(Boolean);
  if (targets.length !== 1) throw new AuthError("INVALID_SHARE_TARGET", 400);

  const share = await prisma.vaultShare.create({
    data: {
      vaultItemId: item.id,
      userId: input.userId ?? null,
      roleId: input.roleId ?? null,
      departmentId: input.departmentId ?? null,
      permission: input.permission,
      sharedById: user.id,
      startsAt: input.startsAt ?? new Date(),
      expiresAt: input.expiresAt ?? null,
      reason: input.reason ?? null,
    },
  });
  await logAccess(user, item, "SHARE_SECRET", "SUCCESS");
  return share;
}

export async function revokeVaultShare(user: CurrentUser, shareId: string) {
  const share = await prisma.vaultShare.findUnique({
    where: { id: shareId },
    include: { vaultItem: true },
  });
  if (!share || share.vaultItem.organizationId !== user.organizationId) {
    throw new AuthError("NOT_FOUND", 404);
  }
  const access = await getVaultAccess(user, share.vaultItem);
  if (access.level < LEVEL_ORDER.SHARE) throw new AuthError("FORBIDDEN", 403);
  await prisma.vaultShare.update({
    where: { id: shareId },
    data: { revokedAt: new Date() },
  });
  await logAccess(user, share.vaultItem, "REVOKE_SECRET", "SUCCESS");
}

// ---------------- Rotation ----------------

export async function markRotation(
  user: CurrentUser,
  id: string,
  status: "ROTATED" | "VERIFIED" | "SKIPPED",
  reason?: string,
  newSecret?: SecretPayload
) {
  const item = await getItemOrThrow(user, id);
  const access = await getVaultAccess(user, item);
  if (access.level < LEVEL_ORDER.EDIT || !user.permissions.has("vault:rotate")) {
    await logAccess(user, item, "ROTATE_SECRET", "DENIED", "NO_ACCESS");
    throw new AuthError("FORBIDDEN", 403);
  }
  const data: Prisma.VaultItemUpdateInput = {};
  if (status === "ROTATED") {
    data.lastRotatedAt = new Date();
    data.nextRotationAt = item.rotationDays
      ? new Date(Date.now() + item.rotationDays * 86_400_000)
      : null;
    if (newSecret) {
      const enc = await encryptSecret(JSON.stringify(newSecret));
      data.ciphertext = enc.ciphertext;
      data.iv = enc.iv;
      data.authTag = enc.authTag;
      data.dekEnc = enc.dekEnc;
      data.kmsKeyVersion = enc.kmsKeyVersion;
    }
  }
  await prisma.$transaction([
    prisma.vaultItem.update({ where: { id: item.id }, data }),
    prisma.vaultRotationLog.create({
      data: { vaultItemId: item.id, rotatedById: user.id, status, reason },
    }),
  ]);
  await logAccess(user, item, "ROTATE_SECRET", "SUCCESS", reason);
}

// ---------------- Emergency access ----------------

export async function requestEmergencyAccess(
  user: CurrentUser,
  vaultItemId: string,
  reason: string
) {
  const item = await getItemOrThrow(user, vaultItemId);
  const req = await prisma.vaultEmergencyRequest.create({
    data: {
      organizationId: user.organizationId,
      vaultItemId: item.id,
      requesterId: user.id,
      reason,
    },
  });
  await logAccess(user, item, "EMERGENCY_ACCESS", "SUCCESS", "REQUESTED");
  // Notify vault managers
  const managers = await prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: "ACTIVE",
      userRoles: {
        some: { role: { key: { in: ["IT_MANAGER", "SECURITY_ADMIN", "SUPER_ADMIN"] } } },
      },
    },
    select: { id: true },
  });
  await prisma.notification.createMany({
    data: managers.map((m) => ({
      organizationId: user.organizationId,
      userId: m.id,
      type: "EMERGENCY_ACCESS",
      level: "CRITICAL" as const,
      title: "Emergency access requested",
      body: `${user.name} requested emergency access to "${item.name}"`,
      link: "/vault/emergency",
    })),
  });
  return req;
}

export async function decideEmergencyAccess(
  user: CurrentUser,
  requestId: string,
  decision: "APPROVED" | "REJECTED",
  validHours = 2
) {
  if (!user.permissions.has("vault:emergency")) throw new AuthError("FORBIDDEN", 403);
  const req = await prisma.vaultEmergencyRequest.findFirst({
    where: { id: requestId, organizationId: user.organizationId, status: "PENDING" },
    include: { vaultItem: true },
  });
  if (!req) throw new AuthError("NOT_FOUND", 404);
  // No self-approval
  if (req.requesterId === user.id) throw new AuthError("FORBIDDEN", 403);

  await prisma.vaultEmergencyRequest.update({
    where: { id: req.id },
    data: {
      status: decision,
      approvedById: user.id,
      decidedAt: new Date(),
      expiresAt:
        decision === "APPROVED"
          ? new Date(Date.now() + validHours * 3_600_000)
          : null,
    },
  });
  await logAccess(user, req.vaultItem, "EMERGENCY_ACCESS", "SUCCESS", decision);
  await prisma.notification.create({
    data: {
      organizationId: user.organizationId,
      userId: req.requesterId,
      type: "EMERGENCY_ACCESS",
      level: decision === "APPROVED" ? "WARNING" : "INFO",
      title: `Emergency access ${decision.toLowerCase()}`,
      body: `Your emergency request for "${req.vaultItem.name}" was ${decision.toLowerCase()}.`,
      link: `/vault/${req.vaultItemId}`,
    },
  });
}
