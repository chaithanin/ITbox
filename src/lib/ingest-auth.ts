import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function bearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const x = req.headers.get("x-api-key");
  return x ? x.trim() : null;
}

/**
 * Resolve the caller's IP for rate limiting. The LEFT-most X-Forwarded-For entry
 * is fully client-controlled (an attacker rotates it to defeat per-IP limits —
 * ING-001), so we trust the RIGHT side, which the platform appends. On Cloud Run
 * the real client IP is the right-most entry; if the service sits behind extra
 * trusted proxies, set INGEST_TRUSTED_PROXIES to how many hops they add so we
 * step that many positions further left.
 */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const ips = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (ips.length > 0) {
      const trusted = Number.parseInt(process.env.INGEST_TRUSTED_PROXIES ?? "0", 10) || 0;
      const idx = ips.length - 1 - trusted;
      return ips[idx >= 0 ? idx : 0];
    }
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export type IngestAuth = { ok: true; orgId: string } | { ok: false; status: number; error: string };

/**
 * Authenticate a machine ingest request against an org integration API key,
 * stored as a SHA-256 hash in SystemSetting. Applies per-IP + per-org rate
 * limits.
 *
 * By default it accepts the shared collector key (`itreport.ingest`, used by the
 * IT-report / Synology / CCTV collectors). Pass `keys` to accept a dedicated
 * key instead — e.g. the HR sync endpoint accepts its own `hr.ingest` key while
 * still honouring the shared collector key for a smooth cut-over.
 */
export async function resolveIngestOrg(
  req: Request,
  opts?: { keys?: string[] },
): Promise<IngestAuth> {
  if (!checkRateLimit(`ingest:ip:${clientIp(req)}`, 120, 60_000)) {
    return { ok: false, status: 429, error: "rate_limited" };
  }
  const key = bearer(req);
  if (!key) return { ok: false, status: 401, error: "missing_api_key" };
  const keys = opts?.keys ?? ["itreport.ingest"];
  const setting = await prisma.systemSetting.findFirst({
    where: { key: { in: keys }, value: { path: ["keyHash"], equals: sha256(key) } },
    select: { organizationId: true },
  });
  if (!setting) return { ok: false, status: 401, error: "invalid_api_key" };
  if (!checkRateLimit(`ingest:org:${setting.organizationId}`, 240, 60_000)) {
    return { ok: false, status: 429, error: "rate_limited" };
  }
  return { ok: true, orgId: setting.organizationId };
}
