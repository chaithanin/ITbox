import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveIngestOrg } from "@/lib/ingest-auth";

export const dynamic = "force-dynamic";

/**
 * Monitoring metrics ingest. A monitoring agent (node_exporter scraper, a
 * cron script, Zabbix/PRTG webhook, etc.) POSTs the current snapshot per host.
 * Latest values are upserted per hostname — real pushed data, not mock.
 *
 * Body: { hosts: [{ hostname, status?, cpu?, mem?, disk?, uptime?(sec), note? }] }
 */
const STATUSES = new Set(["UP", "WARNING", "DOWN", "UNKNOWN"]);
const pct = (v: unknown): number | null =>
  typeof v === "number" && v >= 0 && v <= 100 ? Math.round(v) : null;

export async function POST(req: Request) {
  const auth = await resolveIngestOrg(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const orgId = auth.orgId;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const hosts = (body as { hosts?: unknown[] }).hosts;
  if (!Array.isArray(hosts)) return NextResponse.json({ error: "hosts_required" }, { status: 400 });
  if (hosts.length > 5000) return NextResponse.json({ error: "too_many_hosts" }, { status: 400 });

  let ok = 0;
  const errors: { hostname: string; error: string }[] = [];
  const now = new Date();

  for (const raw of hosts) {
    const h = raw as Record<string, unknown>;
    const hostname = typeof h.hostname === "string" ? h.hostname.trim() : "";
    if (!hostname) { errors.push({ hostname: "(unnamed)", error: "hostname required" }); continue; }
    // Auto-derive status from disk/cpu if not explicitly provided.
    const disk = pct(h.disk), cpu = pct(h.cpu), mem = pct(h.mem);
    let status = typeof h.status === "string" && STATUSES.has(h.status.toUpperCase()) ? h.status.toUpperCase() : "UP";
    if (!(typeof h.status === "string")) {
      if ((disk ?? 0) > 90 || (cpu ?? 0) > 95 || (mem ?? 0) > 95) status = "WARNING";
    }
    const uptime = typeof h.uptime === "number" && h.uptime >= 0 ? BigInt(Math.round(h.uptime)) : null;
    const data = {
      status: status as never,
      cpuPercent: cpu, memPercent: mem, diskPercent: disk,
      uptimeSeconds: uptime,
      note: typeof h.note === "string" ? h.note.slice(0, 500) : null,
      lastSeenAt: now,
    };
    try {
      await prisma.monitoringHost.upsert({
        where: { organizationId_hostname: { organizationId: orgId, hostname } },
        create: { organizationId: orgId, hostname, ...data },
        update: data,
      });
      ok++;
    } catch { errors.push({ hostname, error: "upsert_failed" }); }
  }

  await prisma.auditLog.create({
    data: { organizationId: orgId, action: "IMPORT", entityType: "MONITORING", detail: { via: "monitoring-ingest", ok, failed: errors.length } },
  }).catch(() => {});

  return NextResponse.json({ ok, failed: errors.length, errors: errors.slice(0, 100) });
}
