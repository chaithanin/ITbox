/**
 * IT Support KPI / performance engine.
 *
 * Computes an agent's scorecard from REAL case data (SupportCase +
 * CaseSatisfaction) against per-org, admin-configurable targets & weights
 * (KpiConfig). Produces: per-metric actual/gap/score/status, a weighted overall
 * score, required-per-day to hit month targets, a YTD monthly history, and a
 * deterministic rule-based analysis (no external AI dependency).
 *
 * All reads are org-scoped. Metric direction (higher/lower better) is derived
 * here, not stored, so admins only manage target + weight.
 */
import { prisma } from "@/lib/prisma";
import type { KpiMetric, CaseStatus } from "@prisma/client";

export type KpiStatus = "green" | "yellow" | "red";
export type KpiPeriodKey = "month" | "quarter" | "year";

const OPEN_STATUSES: CaseStatus[] = [
  "NEW", "TRIAGE", "ASSIGNED", "IN_PROGRESS", "WAITING_USER", "WAITING_VENDOR", "REOPENED",
];
const DONE_STATUSES: CaseStatus[] = ["RESOLVED", "CLOSED"];

export const KPI_META: Record<
  KpiMetric,
  { labelTh: string; labelEn: string; unit: string; higherIsBetter: boolean; icon: string }
> = {
  CLOSED_TICKETS: { labelTh: "งานที่ปิดได้", labelEn: "Tickets Completed", unit: "งาน", higherIsBetter: true, icon: "🎫" },
  SLA_COMPLIANCE: { labelTh: "ผ่าน SLA", labelEn: "SLA Compliance", unit: "%", higherIsBetter: true, icon: "⏱" },
  AVG_RESOLUTION_HOURS: { labelTh: "เวลาแก้ไขเฉลี่ย", labelEn: "Avg Resolution", unit: "ชม.", higherIsBetter: false, icon: "⚡" },
  CSAT: { labelTh: "ความพึงพอใจ", labelEn: "User Satisfaction", unit: "/5", higherIsBetter: true, icon: "😊" },
  BACKLOG: { labelTh: "งานค้าง", labelEn: "Open Tickets", unit: "งาน", higherIsBetter: false, icon: "📂" },
};

export const KPI_ORDER: KpiMetric[] = [
  "CLOSED_TICKETS", "SLA_COMPLIANCE", "AVG_RESOLUTION_HOURS", "CSAT", "BACKLOG",
];

export const DEFAULT_KPI_CONFIGS: { metric: KpiMetric; target: number; weight: number; sortOrder: number }[] = [
  { metric: "CLOSED_TICKETS", target: 100, weight: 25, sortOrder: 1 },
  { metric: "SLA_COMPLIANCE", target: 95, weight: 30, sortOrder: 2 },
  { metric: "AVG_RESOLUTION_HOURS", target: 4, weight: 20, sortOrder: 3 },
  { metric: "CSAT", target: 4.5, weight: 15, sortOrder: 4 },
  { metric: "BACKLOG", target: 5, weight: 10, sortOrder: 5 },
];

export interface KpiConfigRow {
  metric: KpiMetric;
  target: number;
  weight: number;
  active: boolean;
  sortOrder: number;
}

/** Load an org's KPI config, falling back to sensible defaults if unset. */
export async function loadKpiConfigs(organizationId: string): Promise<KpiConfigRow[]> {
  const rows = await prisma.kpiConfig.findMany({
    where: { organizationId },
    orderBy: { sortOrder: "asc" },
  });
  if (rows.length === 0) {
    return DEFAULT_KPI_CONFIGS.map((d) => ({ ...d, active: true }));
  }
  return rows.map((r) => ({
    metric: r.metric, target: r.target, weight: r.weight, active: r.active, sortOrder: r.sortOrder,
  }));
}

// ---------------- date helpers ----------------

export function periodRange(key: KpiPeriodKey, now: Date): { start: Date; end: Date } {
  const y = now.getFullYear();
  if (key === "year") return { start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1) };
  if (key === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return { start: new Date(y, q * 3, 1), end: new Date(y, q * 3 + 3, 1) };
  }
  return { start: new Date(y, now.getMonth(), 1), end: new Date(y, now.getMonth() + 1, 1) };
}

/** Weekdays (Mon–Fri) remaining in the period from `now` (inclusive of today). */
export function businessDaysRemaining(end: Date, now: Date): number {
  let count = 0;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (d < end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return Math.max(count, 1);
}

// ---------------- per-metric scoring ----------------

function scoreFor(cfg: KpiConfigRow, actual: number): number {
  const higher = KPI_META[cfg.metric].higherIsBetter;
  if (cfg.target <= 0) return 100;
  const raw = higher ? (actual / cfg.target) * 100 : (actual <= cfg.target ? 100 : (cfg.target / actual) * 100);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function statusFor(cfg: KpiConfigRow, actual: number, score: number): KpiStatus {
  const higher = KPI_META[cfg.metric].higherIsBetter;
  const pass = higher ? actual >= cfg.target : actual <= cfg.target;
  if (pass) return "green";
  return score >= 70 ? "yellow" : "red";
}

export interface MetricResult {
  metric: KpiMetric;
  target: number;
  weight: number;
  actual: number;
  /** How far from target (absolute, in the metric's unit); 0 when passing. */
  gap: number;
  /** Units to do per remaining business day to reach target (month only). */
  requiredPerDay: number | null;
  score: number;
  status: KpiStatus;
}

export interface KpiScorecard {
  period: KpiPeriodKey;
  overall: number;
  overallStatus: KpiStatus;
  metrics: MetricResult[];
  openTickets: number;
  overdueTickets: number;
  backlogByStatus: { status: CaseStatus; count: number }[];
}

async function actualFor(
  organizationId: string,
  userId: string,
  metric: KpiMetric,
  start: Date,
  end: Date
): Promise<number> {
  const mineResolved = {
    organizationId, deletedAt: null, assignedUserId: userId,
    status: { in: DONE_STATUSES }, resolvedAt: { gte: start, lt: end },
  };
  switch (metric) {
    case "CLOSED_TICKETS":
      return prisma.supportCase.count({ where: mineResolved });
    case "SLA_COMPLIANCE": {
      const [total, breached] = await Promise.all([
        prisma.supportCase.count({ where: mineResolved }),
        prisma.supportCase.count({ where: { ...mineResolved, resolutionBreached: true } }),
      ]);
      return total === 0 ? 100 : Math.round(((total - breached) / total) * 1000) / 10;
    }
    case "AVG_RESOLUTION_HOURS": {
      const rows = await prisma.supportCase.findMany({
        where: mineResolved, select: { createdAt: true, resolvedAt: true }, take: 5000,
      });
      if (rows.length === 0) return 0;
      const hrs = rows.reduce((s, r) => s + (r.resolvedAt!.getTime() - r.createdAt.getTime()) / 3.6e6, 0);
      return Math.round((hrs / rows.length) * 10) / 10;
    }
    case "CSAT": {
      const agg = await prisma.caseSatisfaction.aggregate({
        _avg: { rating: true },
        where: {
          createdAt: { gte: start, lt: end },
          case: { organizationId, assignedUserId: userId },
        },
      });
      return Math.round((agg._avg.rating ?? 0) * 10) / 10;
    }
    case "BACKLOG":
      // Point-in-time: current open tickets owned by the agent.
      return prisma.supportCase.count({
        where: { organizationId, deletedAt: null, assignedUserId: userId, status: { in: OPEN_STATUSES } },
      });
  }
}

export async function computeScorecard(
  organizationId: string,
  userId: string,
  period: KpiPeriodKey,
  now: Date
): Promise<KpiScorecard> {
  const configs = (await loadKpiConfigs(organizationId)).filter((c) => c.active);
  const { start, end } = periodRange(period, now);
  const daysLeft = businessDaysRemaining(periodRange("month", now).end, now);

  const metrics: MetricResult[] = await Promise.all(
    configs.map(async (cfg) => {
      const actual = await actualFor(organizationId, userId, cfg.metric, start, end);
      const higher = KPI_META[cfg.metric].higherIsBetter;
      const gap = higher ? Math.max(0, cfg.target - actual) : Math.max(0, actual - cfg.target);
      const score = scoreFor(cfg, actual);
      const status = statusFor(cfg, actual, score);
      // required/day only meaningful for count metrics in the current month
      let requiredPerDay: number | null = null;
      if (period === "month" && gap > 0 && (cfg.metric === "CLOSED_TICKETS" || cfg.metric === "BACKLOG")) {
        requiredPerDay = Math.round((gap / daysLeft) * 10) / 10;
      }
      return { metric: cfg.metric, target: cfg.target, weight: cfg.weight, actual, gap, requiredPerDay, score, status };
    })
  );

  const totalWeight = metrics.reduce((s, m) => s + m.weight, 0) || 1;
  const overall = Math.round(metrics.reduce((s, m) => s + m.score * m.weight, 0) / totalWeight);
  const overallStatus: KpiStatus = overall >= 85 ? "green" : overall >= 70 ? "yellow" : "red";

  const [openTickets, overdueTickets, backlogGroups] = await Promise.all([
    prisma.supportCase.count({
      where: { organizationId, deletedAt: null, assignedUserId: userId, status: { in: OPEN_STATUSES } },
    }),
    prisma.supportCase.count({
      where: {
        organizationId, deletedAt: null, assignedUserId: userId,
        status: { in: OPEN_STATUSES }, resolutionDueAt: { lt: now },
      },
    }),
    prisma.supportCase.groupBy({
      by: ["status"], _count: true,
      where: { organizationId, deletedAt: null, assignedUserId: userId, status: { in: OPEN_STATUSES } },
    }),
  ]);

  return {
    period, overall, overallStatus, metrics, openTickets, overdueTickets,
    backlogByStatus: backlogGroups
      .map((g) => ({ status: g.status, count: g._count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ---------------- YTD monthly history ----------------

export interface MonthlyScore {
  month: number; // 0-11
  labelTh: string;
  overall: number | null; // null = future month
  status: KpiStatus | null;
}

export async function computeMonthlyHistory(
  organizationId: string,
  userId: string,
  now: Date
): Promise<{ months: MonthlyScore[]; annual: number }> {
  const configs = (await loadKpiConfigs(organizationId)).filter((c) => c.active);
  const totalWeight = configs.reduce((s, c) => s + c.weight, 0) || 1;
  const y = now.getFullYear();
  const months: MonthlyScore[] = [];
  const done: number[] = [];

  for (let m = 0; m < 12; m++) {
    const label = new Date(y, m, 1).toLocaleDateString("th-TH", { month: "short" });
    if (m > now.getMonth()) {
      months.push({ month: m, labelTh: label, overall: null, status: null });
      continue;
    }
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 1);
    const scores = await Promise.all(
      configs.map(async (cfg) => {
        const actual = await actualFor(organizationId, userId, cfg.metric, start, end);
        return scoreFor(cfg, actual) * cfg.weight;
      })
    );
    const overall = Math.round(scores.reduce((s, v) => s + v, 0) / totalWeight);
    const status: KpiStatus = overall >= 85 ? "green" : overall >= 70 ? "yellow" : "red";
    months.push({ month: m, labelTh: label, overall, status });
    done.push(overall);
  }
  const annual = done.length ? Math.round(done.reduce((s, v) => s + v, 0) / done.length) : 0;
  return { months, annual };
}

// ---------------- rule-based analysis ----------------

const STATUS_LABEL_TH: Partial<Record<CaseStatus, string>> = {
  WAITING_USER: "รอผู้ใช้ตอบกลับ",
  WAITING_VENDOR: "รอผู้ขาย/Vendor",
  IN_PROGRESS: "กำลังดำเนินการ",
  ASSIGNED: "รับเรื่องแล้ว",
  NEW: "ใหม่",
  TRIAGE: "คัดแยก",
  REOPENED: "เปิดใหม่",
};

export interface KpiAnalysis {
  headline: string;
  actions: { level: KpiStatus; text: string }[];
}

/** Deterministic "smart" summary derived from the scorecard numbers. */
export function analyzeScorecard(card: KpiScorecard, now: Date): KpiAnalysis {
  const actions: { level: KpiStatus; text: string }[] = [];
  const daysLeft = businessDaysRemaining(periodRange("month", now).end, now);

  for (const m of card.metrics) {
    if (m.status === "green") continue;
    const meta = KPI_META[m.metric];
    if (m.metric === "CLOSED_TICKETS" && m.gap > 0) {
      actions.push({
        level: m.status,
        text: `ปิดงานเพิ่มอีก ${m.gap} งาน${m.requiredPerDay ? ` (≈ ${m.requiredPerDay} งาน/วัน ใน ${daysLeft} วันทำการที่เหลือ)` : ""} เพื่อให้ถึงเป้า ${m.target}`,
      });
    } else if (m.metric === "BACKLOG" && m.gap > 0) {
      actions.push({
        level: m.status,
        text: `ลดงานค้างอีก ${m.gap} งาน${m.requiredPerDay ? ` (≈ ${m.requiredPerDay} งาน/วัน)` : ""} ให้เหลือไม่เกิน ${m.target}`,
      });
    } else if (m.metric === "CSAT" && m.gap > 0) {
      actions.push({ level: m.status, text: `เพิ่มคะแนนความพึงพอใจอีก ${m.gap.toFixed(1)} เพื่อให้ถึง ${m.target}` });
    } else if (m.metric === "SLA_COMPLIANCE") {
      actions.push({ level: m.status, text: `ยกระดับการตอบ SLA ให้ถึง ${m.target}% (ปัจจุบัน ${m.actual}%)` });
    } else if (m.metric === "AVG_RESOLUTION_HOURS") {
      actions.push({ level: m.status, text: `ลดเวลาแก้ไขเฉลี่ยให้ ≤ ${m.target} ชม. (ปัจจุบัน ${m.actual} ชม.)` });
    } else {
      actions.push({ level: m.status, text: `ปรับปรุง ${meta.labelTh} ให้ถึงเป้า ${m.target}${meta.unit}` });
    }
  }

  if (card.overdueTickets > 0) {
    actions.unshift({ level: "red", text: `เคลียร์งานเกินกำหนด (overdue) ${card.overdueTickets} งานโดยด่วน` });
  }
  const waitUser = card.backlogByStatus.find((b) => b.status === "WAITING_USER")?.count ?? 0;
  const waitVendor = card.backlogByStatus.find((b) => b.status === "WAITING_VENDOR")?.count ?? 0;
  if (waitUser > 0) actions.push({ level: "yellow", text: `ติดตามผู้ใช้ที่ค้างตอบกลับ ${waitUser} เคส` });
  if (waitVendor > 0) actions.push({ level: "yellow", text: `เร่ง/Escalate เคสที่รอผู้ขาย ${waitVendor} เคส` });

  const pending = card.metrics.filter((m) => m.status !== "green").length;
  const headline =
    pending === 0
      ? `เยี่ยมมาก! KPI ของคุณผ่านเป้าครบทุกตัว (คะแนนรวม ${card.overall}/100)`
      : `คะแนนรวม ${card.overall}/100 — มี KPI ที่ต้องดำเนินการ ${pending} รายการ` +
        (card.overdueTickets > 0 ? ` และมีงานเกินกำหนด ${card.overdueTickets} งาน` : "");

  return { headline, actions };
}

export function statusColorClass(s: KpiStatus): string {
  return s === "green"
    ? "text-emerald-600 dark:text-emerald-400"
    : s === "yellow"
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
}

export function statusDot(s: KpiStatus): string {
  return s === "green" ? "🟢" : s === "yellow" ? "🟡" : "🔴";
}
