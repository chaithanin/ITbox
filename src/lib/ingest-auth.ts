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

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0] : "").trim() || "unknown";
}

export type IngestAuth = { ok: true; orgId: string } | { ok: false; status: number; error: string };

/**
 * Authenticate a machine ingest request against the org's collector API key
 * (the same key used by the IT-report / Synology collector), stored as a
 * SHA-256 hash in SystemSetting. Applies per-IP + per-org rate limits.
 */
export async function resolveIngestOrg(req: Request): Promise<IngestAuth> {
  if (!checkRateLimit(`ingest:ip:${clientIp(req)}`, 120, 60_000)) {
    return { ok: false, status: 429, error: "rate_limited" };
  }
  const key = bearer(req);
  if (!key) return { ok: false, status: 401, error: "missing_api_key" };
  const setting = await prisma.systemSetting.findFirst({
    where: { key: "itreport.ingest", value: { path: ["keyHash"], equals: sha256(key) } },
    select: { organizationId: true },
  });
  if (!setting) return { ok: false, status: 401, error: "invalid_api_key" };
  if (!checkRateLimit(`ingest:org:${setting.organizationId}`, 240, 60_000)) {
    return { ok: false, status: 429, error: "rate_limited" };
  }
  return { ok: true, orgId: setting.organizationId };
}
