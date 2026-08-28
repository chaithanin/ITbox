import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveIngestOrg } from "@/lib/ingest-auth";

export const dynamic = "force-dynamic";

/**
 * EDR / antivirus posture ingest. An endpoint agent (Defender, CrowdStrike,
 * a small script, etc.) running INSIDE the network POSTs each device's
 * protection status here, authenticated by the org collector API key. One row
 * per hostname is upserted with the latest posture — no mock data.
 *
 * Body: { hosts: [{ hostname, protectionStatus?, agentVersion?, osVersion?,
 *   lastScan?(ISO), threatsFound?, isolated? }] }
 */
const STATUSES = new Set(["PROTECTED", "AT_RISK", "OFFLINE", "UNKNOWN"]);

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
    const status = typeof h.protectionStatus === "string" && STATUSES.has(h.protectionStatus.toUpperCase()) ? h.protectionStatus.toUpperCase() : "UNKNOWN";
    const threats = typeof h.threatsFound === "number" && h.threatsFound >= 0 ? Math.round(h.threatsFound) : 0;
    const lastScanAt = typeof h.lastScan === "string" && !Number.isNaN(Date.parse(h.lastScan)) ? new Date(h.lastScan) : null;
    const data = {
      protectionStatus: status as never,
      agentVersion: typeof h.agentVersion === "string" ? h.agentVersion.slice(0, 100) : null,
      osVersion: typeof h.osVersion === "string" ? h.osVersion.slice(0, 100) : null,
      lastScanAt,
      threatsFound: threats,
      isolated: h.isolated === true,
      lastSeenAt: now,
    };
    try {
      await prisma.endpointPosture.upsert({
        where: { organizationId_hostname: { organizationId: orgId, hostname } },
        create: { organizationId: orgId, hostname, ...data },
        update: data,
      });
      ok++;
    } catch { errors.push({ hostname, error: "upsert_failed" }); }
  }

  await prisma.auditLog.create({
    data: { organizationId: orgId, action: "IMPORT", entityType: "ENDPOINT_POSTURE", detail: { via: "edr-ingest", ok, failed: errors.length } },
  }).catch(() => {});

  return NextResponse.json({ ok, failed: errors.length, errors: errors.slice(0, 100) });
}
