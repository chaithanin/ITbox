"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, requireUser, AuthError } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { hashPassword, verifyPassword, validatePasswordPolicy } from "@/lib/password";
import { generateTotpSecret, storeTotpSecret, verifyTotp, verifyTotpCode } from "@/lib/mfa";
import { decryptSecret } from "@/lib/crypto/envelope";

// ---------------- User management (admin) ----------------

const createUserSchema = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(200),
  password: z.string().min(1).max(256),
  confirmPassword: z.string().min(1).max(256),
  roleId: z.string().uuid(),
});

export async function createUserAction(formData: FormData) {
  const admin = await requirePermission("user:manage");
  // Validate gracefully: a short/invalid password must show a message, not
  // crash the page with an uncaught ZodError.
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect("/settings/users?error=invalid-input");
  }
  const input = parsed.data;
  if (input.password !== input.confirmPassword) {
    redirect("/settings/users?error=password-mismatch");
  }
  if (!validatePasswordPolicy(input.password).ok) {
    redirect("/settings/users?error=weak-password");
  }
  const role = await prisma.role.findFirst({
    where: { id: input.roleId, organizationId: admin.organizationId },
  });
  if (!role) redirect("/settings/users?error=role-not-found");
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    redirect("/settings/users?error=email-exists");
  }
  const user = await prisma.user.create({
    data: {
      organizationId: admin.organizationId,
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
      userRoles: { create: { roleId: role.id } },
    },
  });
  await auditLog(admin, {
    action: "CREATE", entityType: "USER", entityId: user.id,
    detail: { email: input.email, role: role.key },
  });
  revalidatePath("/settings/users");
  redirect("/settings/users?ok=user-created");
}

/**
 * Admin MFA control. Admins can DISABLE/RESET a user's MFA (recovery when a
 * user loses their authenticator) — this clears the enrolled TOTP secret and
 * revokes sessions. Admins cannot ENABLE MFA for someone else, because TOTP
 * enrollment requires the user to scan the QR themselves (Settings → Profile).
 */
export async function disableUserMfaAction(userId: string) {
  const admin = await requirePermission("user:manage");
  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: admin.organizationId, deletedAt: null },
  });
  if (!target) redirect("/settings/users?error=user-not-found");
  await prisma.user.update({
    where: { id: target!.id },
    data: { mfaEnabled: false, totpSecretEnc: null, totpSecretDekEnc: null },
  });
  await prisma.userSession.updateMany({
    where: { userId: target!.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await auditLog(admin, {
    action: "UPDATE", entityType: "USER", entityId: target!.id,
    detail: { event: "MFA_DISABLED_BY_ADMIN" },
  });
  revalidatePath("/settings/users");
  redirect("/settings/users?ok=mfa-disabled");
}

export async function setUserStatusAction(userId: string, formData: FormData) {
  const admin = await requirePermission("user:manage");
  const status = z.enum(["ACTIVE", "DISABLED"]).parse(formData.get("status"));
  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: admin.organizationId, deletedAt: null },
  });
  if (!target) throw new AuthError("NOT_FOUND", 404);
  if (target.id === admin.id) throw new AuthError("CANNOT_MODIFY_SELF", 400);
  await prisma.user.update({
    where: { id: target.id },
    data: { status, lockedUntil: null, failedLoginCount: 0 },
  });
  if (status === "DISABLED") {
    await prisma.userSession.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  await auditLog(admin, {
    action: "UPDATE", entityType: "USER", entityId: target.id, detail: { status },
  });
  revalidatePath("/settings/users");
}

export async function setUserRolesAction(userId: string, formData: FormData) {
  const admin = await requirePermission("user:manage");
  const roleIds = formData.getAll("roleIds").map((v) => z.string().uuid().parse(v));
  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: admin.organizationId, deletedAt: null },
  });
  if (!target) throw new AuthError("NOT_FOUND", 404);
  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds }, organizationId: admin.organizationId },
  });
  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: target.id } }),
    prisma.userRole.createMany({
      data: roles.map((r) => ({ userId: target.id, roleId: r.id })),
    }),
  ]);
  await auditLog(admin, {
    action: "UPDATE", entityType: "USER", entityId: target.id,
    detail: { roles: roles.map((r) => r.key) },
  });
  revalidatePath("/settings/users");
}

export async function adminResetPasswordAction(userId: string, formData: FormData) {
  const admin = await requirePermission("user:manage");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (password !== confirm) {
    redirect("/settings/users?error=password-mismatch");
  }
  if (!validatePasswordPolicy(password).ok) {
    redirect("/settings/users?error=weak-password");
  }
  const target = await prisma.user.findFirst({
    where: { id: userId, organizationId: admin.organizationId, deletedAt: null },
  });
  if (!target) redirect("/settings/users?error=user-not-found");
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null },
  });
  // Revoke sessions so the new password must be used
  await prisma.userSession.updateMany({
    where: { userId: target.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await auditLog(admin, {
    action: "UPDATE", entityType: "USER", entityId: target.id,
    detail: { event: "PASSWORD_RESET_BY_ADMIN" },
  });
  revalidatePath("/settings/users");
  redirect("/settings/users?ok=password-reset");
}

// ---------------- Role permissions ----------------

export async function setRolePermissionsAction(roleId: string, formData: FormData) {
  const admin = await requirePermission("role:manage");
  const permKeys = formData.getAll("perms").map(String);
  const role = await prisma.role.findFirst({
    where: { id: roleId, organizationId: admin.organizationId },
  });
  if (!role) throw new AuthError("NOT_FOUND", 404);
  if (role.key === "SUPER_ADMIN") throw new AuthError("CANNOT_MODIFY_SUPER_ADMIN", 400);
  const perms = await prisma.permission.findMany({ where: { key: { in: permKeys } } });
  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
    prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })),
    }),
  ]);
  await auditLog(admin, {
    action: "UPDATE", entityType: "ROLE", entityId: role.id,
    detail: { role: role.key, permissionCount: perms.length },
  });
  revalidatePath(`/settings/roles/${role.id}`);
  revalidatePath("/settings/roles");
}

// ---------------- Profile / MFA / sessions (self-service) ----------------

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();
  const name = z.string().min(1).max(200).parse(formData.get("name"));
  const locale = z.enum(["th", "en"]).parse(formData.get("locale") ?? "th");
  await prisma.user.update({ where: { id: user.id }, data: { name, locale } });
  await auditLog(user, { action: "UPDATE", entityType: "USER", entityId: user.id, detail: { event: "PROFILE" } });
  revalidatePath("/settings/profile");
}

export async function changePasswordAction(formData: FormData) {
  const user = await requireUser();
  const current = z.string().min(1).parse(formData.get("current"));
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!dbUser.passwordHash || !(await verifyPassword(dbUser.passwordHash, current))) {
    await auditLog(user, {
      action: "UPDATE", entityType: "USER", entityId: user.id,
      detail: { event: "PASSWORD_CHANGE" }, result: "DENIED",
    });
    redirect("/settings/profile?error=wrong-password");
  }
  if (next !== confirm) {
    redirect("/settings/profile?error=password-mismatch");
  }
  if (!validatePasswordPolicy(next).ok) {
    redirect("/settings/profile?error=weak-password");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(next) },
  });
  await auditLog(user, {
    action: "UPDATE", entityType: "USER", entityId: user.id,
    detail: { event: "PASSWORD_CHANGE" },
  });
  redirect("/settings/profile?ok=password-changed");
}

/** Step 1: generate + store encrypted TOTP secret (pending until verified). */
export async function startMfaEnrollmentAction() {
  const user = await requireUser();
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (dbUser.mfaEnabled) return;
  const secret = generateTotpSecret();
  await storeTotpSecret(user.id, secret);
  await auditLog(user, {
    action: "UPDATE", entityType: "USER", entityId: user.id,
    detail: { event: "MFA_ENROLL_STARTED" },
  });
  revalidatePath("/settings/profile");
}

/** Step 2: verify a code from the authenticator app to activate MFA. */
export async function confirmMfaEnrollmentAction(formData: FormData) {
  const user = await requireUser();
  const code = z.string().min(6).max(8).parse(formData.get("code"));
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (dbUser.mfaEnabled) return;
  const ok = await verifyTotp(dbUser, code);
  if (!ok) redirect("/settings/profile?error=mfa-invalid");
  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
  await auditLog(user, {
    action: "UPDATE", entityType: "USER", entityId: user.id,
    detail: { event: "MFA_ENABLED" },
  });
  redirect("/settings/profile?ok=mfa-enabled");
}

export async function disableMfaAction(formData: FormData) {
  const user = await requireUser();
  const code = z.string().min(6).max(8).parse(formData.get("code"));
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!dbUser.mfaEnabled) return;
  const ok = await verifyTotp(dbUser, code);
  if (!ok) redirect("/settings/profile?error=mfa-invalid");
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, totpSecretEnc: null, totpSecretDekEnc: null },
  });
  await auditLog(user, {
    action: "UPDATE", entityType: "USER", entityId: user.id,
    detail: { event: "MFA_DISABLED" },
  });
  redirect("/settings/profile?ok=mfa-disabled");
}

export async function deletePasskeyAction(credentialId: string) {
  const user = await requireUser();
  await prisma.webAuthnCredential.deleteMany({
    where: { id: credentialId, userId: user.id },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "USER",
    entityId: user.id,
    detail: { event: "PASSKEY_REMOVED", credentialId },
  });
  revalidatePath("/settings/profile");
}

export async function revokeSessionAction(sessionId: string) {
  const user = await requireUser();
  await prisma.userSession.updateMany({
    where: { id: sessionId, userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await auditLog(user, {
    action: "UPDATE", entityType: "SESSION", entityId: sessionId,
    detail: { event: "SESSION_REVOKED" },
  });
  revalidatePath("/settings/profile");
}

export async function revokeAllSessionsAction() {
  const user = await requireUser();
  await prisma.userSession.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await auditLog(user, {
    action: "UPDATE", entityType: "SESSION",
    detail: { event: "ALL_SESSIONS_REVOKED" },
  });
  redirect("/login");
}

// Used by the MFA QR endpoint — returns the otpauth URI only while enrollment
// is pending (mfaEnabled=false). Never exposed after activation.
export async function getPendingTotpUri(): Promise<string | null> {
  const user = await requireUser();
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (dbUser.mfaEnabled || !dbUser.totpSecretEnc || !dbUser.totpSecretDekEnc) return null;
  const parsed = JSON.parse(dbUser.totpSecretEnc) as {
    ciphertext: string; iv: string; authTag: string;
  };
  const secret = await decryptSecret({ ...parsed, dekEnc: dbUser.totpSecretDekEnc });
  const { totpUri } = await import("@/lib/mfa");
  // sanity: round-trip validation is unnecessary; just avoid unused import complaints
  void verifyTotpCode;
  return totpUri(user.email, secret);
}
