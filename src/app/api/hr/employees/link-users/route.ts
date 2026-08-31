import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveIngestOrg } from "@/lib/ingest-auth";
import { linkEmployeesToUsers } from "@/lib/hr-user-link";

export const dynamic = "force-dynamic";

/**
 * Reconcile the whole employee roster to TECHCORE user accounts by email
 * (org-scoped). A one-shot/periodic backfill companion to the per-batch linking
 * that /api/hr/employees/sync already does — run it once to connect existing
 * employees, or on a schedule as a safety net.
 *
 * Auth: the HR sync key (`hr.ingest`) or the shared collector key.
 * POST (no body needed) -> { linked, unmatched, alreadyLinked }
 */
export async function POST(req: Request) {
  const auth = await resolveIngestOrg(req, { keys: ["hr.ingest", "itreport.ingest"] });
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await linkEmployeesToUsers(auth.orgId);

  await prisma.auditLog.create({
    data: {
      organizationId: auth.orgId,
      action: "UPDATE",
      entityType: "EMPLOYEE",
      detail: { via: "hr-link-users", ...result },
    },
  }).catch(() => {});

  return NextResponse.json(result);
}
