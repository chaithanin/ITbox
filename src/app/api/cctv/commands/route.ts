import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveIngestOrg } from "@/lib/ingest-auth";

export const dynamic = "force-dynamic";

/**
 * Collector command poll. The on-prem collector GETs this at the start of each
 * cycle to learn which recorders an operator asked to re-check immediately
 * ("Check Now"). Authenticated by the org collector API key. The flag itself is
 * cleared when the collector next pushes that recorder's state to /api/cctv/ingest.
 *
 * Response: { recheckSerials: ["<serial>", ...] }
 */
export async function GET(req: Request) {
  const auth = await resolveIngestOrg(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const rows = await prisma.cctvRecorder.findMany({
    where: { organizationId: auth.orgId, deletedAt: null, recheckRequestedAt: { not: null } },
    select: { serial: true },
    take: 1000,
  });
  return NextResponse.json({ recheckSerials: rows.map((r) => r.serial) });
}
