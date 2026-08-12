import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/session";

// Keys that must never appear in audit detail payloads.
const FORBIDDEN_KEYS = /pass(word)?|secret|token|api[_-]?key|private[_-]?key|ciphertext|dek|credential/i;

/** Strip any accidentally-included sensitive keys before persisting. */
export function sanitizeDetail(detail: unknown): unknown {
  if (detail === null || detail === undefined) return undefined;
  if (Array.isArray(detail)) return detail.map(sanitizeDetail);
  if (typeof detail === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(detail as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.test(k)) continue;
      out[k] = sanitizeDetail(v);
    }
    return out;
  }
  return detail;
}

export async function auditLog(
  user: Pick<CurrentUser, "id" | "organizationId" | "ip" | "userAgent"> | null,
  params: {
    organizationId?: string;
    action: string;
    entityType?: string;
    entityId?: string;
    detail?: object;
    result?: "SUCCESS" | "DENIED" | "FAILED";
  }
): Promise<void> {
  const organizationId = params.organizationId ?? user?.organizationId;
  if (!organizationId) return;
  try {
    await prisma.auditLog.create({
      data: {
        organizationId,
        userId: user?.id ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        detail: params.detail
          ? JSON.parse(JSON.stringify(sanitizeDetail(params.detail)))
          : undefined,
        ip: user?.ip ?? null,
        userAgent: user?.userAgent ?? null,
        result: params.result ?? "SUCCESS",
      },
    });
  } catch (e) {
    // Auditing must not take the app down, but do surface the failure.
    console.error("audit log write failed", (e as Error).message);
  }
}
