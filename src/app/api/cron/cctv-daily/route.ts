import { NextResponse } from "next/server";
import { sendDailyCctvReports } from "@/lib/services/cctv-report";
import { verifyCronSecret } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

/**
 * Daily CCTV health report email. Schedule once a day via Cloud Scheduler → Cloud
 * Run (at the time configured in CCTV settings, in your timezone). Emails the
 * summary to each org's configured recipients. Protected by CRON_SECRET.
 */
export async function POST(req: Request) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await sendDailyCctvReports();
  return NextResponse.json({ ok: true, ...result });
}
