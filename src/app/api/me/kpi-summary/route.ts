import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { computeScorecard, analyzeScorecard, KPI_META } from "@/lib/services/kpi";

// Compact month KPI summary for the current user — used by the post-login popup.
export const GET = apiHandler(async () => {
  const user = await requireUser();
  if (!user.permissions.has("support:work") && !user.permissions.has("support:read")) {
    return NextResponse.json({ eligible: false });
  }
  const now = new Date();
  const card = await computeScorecard(user.organizationId, user.id, "month", now);
  const analysis = analyzeScorecard(card, now);
  return NextResponse.json({
    eligible: true,
    firstName: (user.name ?? "").split(" ")[0] || user.name,
    overall: card.overall,
    overallStatus: card.overallStatus,
    openTickets: card.openTickets,
    overdueTickets: card.overdueTickets,
    metrics: card.metrics.map((m) => ({
      metric: m.metric,
      labelTh: KPI_META[m.metric].labelTh,
      unit: KPI_META[m.metric].unit,
      actual: m.actual,
      target: m.target,
      gap: m.gap,
      status: m.status,
    })),
    headline: analysis.headline,
    actions: analysis.actions,
  });
});
