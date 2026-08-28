import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return (xff ? xff.split(",")[0] : "").trim() || "unknown";
}

/**
 * Machine ingest endpoint for on-prem collectors (Synology, etc.).
 *
 * The app runs in the cloud and cannot reach a LAN NAS directly, so a small
 * collector script running INSIDE the customer network pulls status from the
 * device and PUSHes it here, authenticated by an org ingest API key (never a
 * user session). The key's SHA-256 hash is stored in SystemSetting; we resolve
 * the org from the hash. Rows are upserted as mode=AUTO ItHealthChecks.
 */

const CATEGORIES = new Set(["SERVER", "BACKUP", "STORAGE", "CCTV", "PHONE", "GPS", "LOG", "MANGO_LOGIN", "MANGO_USAGE", "OTHER"]);
const STATUSES = new Set(["NORMAL", "WARNING", "CRITICAL", "NOT_CHECKED"]);
const MODES = new Set(["AUTO", "CHECK_REQUIRED", "ISSUE"]);

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function bearer(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  const x = req.headers.get("x-api-key");
  return x ? x.trim() : null;
}

function utcDay(input?: string): Date {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(`${input}T00:00:00.000Z`);
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function POST(req: Request) {
  // Per-IP throttle BEFORE any DB work — caps key brute-force + bulk-write abuse.
  if (!checkRateLimit(`ingest:ip:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const key = bearer(req);
  if (!key) return NextResponse.json({ error: "missing_api_key" }, { status: 401 });

  const setting = await prisma.systemSetting.findFirst({
    where: { key: "itreport.ingest", value: { path: ["keyHash"], equals: sha256(key) } },
    select: { organizationId: true },
  });
  if (!setting) return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });
  const orgId = setting.organizationId;

  // Per-org throttle — a valid key still can't hammer the write path.
  if (!checkRateLimit(`ingest:org:${orgId}`, 120, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const payload = body as { date?: string; source?: string; checks?: unknown[] };
  if (!Array.isArray(payload.checks)) return NextResponse.json({ error: "checks_required" }, { status: 400 });
  if (payload.checks.length > 5000) return NextResponse.json({ error: "too_many_checks" }, { status: 400 });

  const checkDate = utcDay(payload.date);
  let ok = 0;
  const errors: { name: string; error: string }[] = [];

  for (const raw of payload.checks) {
    const c = raw as Record<string, unknown>;
    const name = typeof c.name === "string" ? c.name.trim() : "";
    const category = typeof c.category === "string" ? c.category.toUpperCase().replace(/[\s-]+/g, "_") : "";
    if (!name || !CATEGORIES.has(category)) {
      errors.push({ name: name || "(unnamed)", error: "name + valid category required" });
      continue;
    }
    const status = typeof c.status === "string" && STATUSES.has(c.status.toUpperCase()) ? c.status.toUpperCase() : "NOT_CHECKED";
    const mode = typeof c.mode === "string" && MODES.has(c.mode.toUpperCase()) ? c.mode.toUpperCase() : "AUTO";
    const hpRaw = c.healthPercent;
    const healthPercent = typeof hpRaw === "number" && hpRaw >= 0 && hpRaw <= 100 ? Math.round(hpRaw) : null;
    const metrics = c.metrics && typeof c.metrics === "object" ? (c.metrics as Record<string, unknown>) : undefined;
    const note = typeof c.note === "string" ? c.note.slice(0, 2000) : null;

    try {
      await prisma.itHealthCheck.upsert({
        where: { organizationId_checkDate_category_name: { organizationId: orgId, checkDate, category: category as never, name } },
        create: { organizationId: orgId, checkDate, category: category as never, name, status: status as never, mode: mode as never, healthPercent, metrics: metrics as never, note },
        update: { status: status as never, mode: mode as never, healthPercent, metrics: metrics as never, note },
      });
      ok++;
    } catch {
      errors.push({ name, error: "upsert_failed" });
    }
  }

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      action: "IMPORT",
      entityType: "IT_HEALTH_CHECK",
      detail: { via: "ingest", source: payload.source ?? "collector", date: checkDate.toISOString().slice(0, 10), ok, failed: errors.length },
    },
  }).catch(() => {});

  return NextResponse.json({ ok, failed: errors.length, errors: errors.slice(0, 100) });
}
