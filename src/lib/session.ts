import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { PermissionKey } from "@/lib/permissions";

export interface CurrentUser {
  id: string;
  organizationId: string;
  email: string;
  name: string;
  locale: string;
  mfaEnabled: boolean;
  roles: string[];
  permissions: Set<string>;
  employeeId: string | null;
  ip: string | null;
  userAgent: string | null;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Resolve and validate the current user for this request:
 * revocable session check, user status check, role/permission load.
 * Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const jti = session.user.jti;
  if (jti) {
    const dbSession = await prisma.userSession.findUnique({
      where: { tokenId: jti },
      select: { revokedAt: true, expiresAt: true, id: true, lastSeenAt: true },
    });
    if (!dbSession || dbSession.revokedAt || dbSession.expiresAt < new Date()) {
      return null;
    }
    // Throttled lastSeen update (idle-session visibility)
    if (Date.now() - dbSession.lastSeenAt.getTime() > 60_000) {
      prisma.userSession
        .update({ where: { id: dbSession.id }, data: { lastSeenAt: new Date() } })
        .catch(() => {});
    }
  }

  const user = await prisma.user.findFirst({
    where: { id: session.user.id, deletedAt: null, status: "ACTIVE" },
    include: {
      employee: { select: { id: true } },
      userRoles: {
        include: {
          role: {
            include: { rolePermissions: { include: { permission: true } } },
          },
        },
      },
    },
  });
  if (!user) return null;

  const roles = user.userRoles.map((ur) => ur.role.key);
  const permissions = new Set<string>();
  for (const ur of user.userRoles) {
    for (const rp of ur.role.rolePermissions) permissions.add(rp.permission.key);
  }

  let ip: string | null = null;
  let userAgent: string | null = null;
  try {
    const h = await headers();
    ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null;
    userAgent = h.get("user-agent");
  } catch {
    // headers() unavailable (e.g. during static generation)
  }

  return {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    name: user.name,
    locale: user.locale,
    mfaEnabled: user.mfaEnabled,
    roles,
    permissions,
    employeeId: user.employee?.id ?? null,
    ip,
    userAgent,
  };
});

/** Throws if unauthenticated. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("UNAUTHENTICATED", 401);
  return user;
}

export function hasPermission(user: CurrentUser, perm: PermissionKey): boolean {
  return user.permissions.has(perm);
}

/** Throws if the user lacks the permission. */
export async function requirePermission(perm: PermissionKey): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.permissions.has(perm)) {
    throw new AuthError(`FORBIDDEN:${perm}`, 403);
  }
  return user;
}
