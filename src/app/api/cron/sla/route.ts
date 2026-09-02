import { NextResponse } from "next/server";
import { runSlaSweep } from "@/lib/services/support";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * High-frequency SLA sweep (call every 5–15 min via Cloud Scheduler → Cloud Run).
 * Split out from the once-daily /api/cron/checks job so SLA warnings, breaches,
 * and escalations are detected in near-real-time rather than up to ~24h late.
 *
 * Protected by CRON_SECRET (Authorization: Bearer <secret>).
 */
export async function POST(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const notified = await runSlaSweep();
  return NextResponse.json({ ok: true, notified });
}
