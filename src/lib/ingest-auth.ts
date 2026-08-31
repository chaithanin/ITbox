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
