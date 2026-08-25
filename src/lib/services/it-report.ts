/**
 * IT Support Report Center — pure rollup helpers for the Daily IT Health
 * dashboard. No Prisma here; pages pass in the day's ItHealthCheck rows.
 */

export type ItSystemCategory =
  | "SERVER" | "BACKUP" | "STORAGE" | "CCTV" | "PHONE" | "GPS" | "LOG" | "MANGO_LOGIN" | "MANGO_USAGE" | "OTHER";
export type ItHealthStatus = "NORMAL" | "WARNING" | "CRITICAL" | "NOT_CHECKED";
export type ItReportMode = "AUTO" | "CHECK_REQUIRED" | "ISSUE";

export interface HealthCheck {
  id: string;
  category: ItSystemCategory;
  name: string;
  mode: ItReportMode;
  status: ItHealthStatus;
  healthPercent: number | null;
  metrics: unknown;
  note: string | null;
  issueCaseId: string | null;
  locationName?: string | null;
}

export const CATEGORY_META: Record<ItSystemCategory, { label: string; en: string; order: number }> = {
  SERVER: { label: "เซิร์ฟเวอร์", en: "Server", order: 1 },
  BACKUP: { label: "สำรองข้อมูล", en: "Backup", order: 2 },
  STORAGE: { label: "พื้นที่จัดเก็บ", en: "Storage", order: 3 },
  CCTV: { label: "กล้องวงจรปิด", en: "CCTV", order: 4 },
  PHONE: { label: "โทรศัพท์/แอป", en: "Phone / App", order: 5 },
  GPS: { label: "GPS", en: "GPS", order: 6 },
  LOG: { label: "Log Server", en: "Log Server", order: 7 },
  MANGO_LOGIN: { label: "Mango Login", en: "Mango Login", order: 8 },
  MANGO_USAGE: { label: "Mango Program", en: "Mango Usage", order: 9 },
  OTHER: { label: "อื่นๆ", en: "Other", order: 10 },
};

export const CATEGORY_ORDER = (Object.keys(CATEGORY_META) as ItSystemCategory[]).sort(
  (a, b) => CATEGORY_META[a].order - CATEGORY_META[b].order
);

export const HEALTH_META: Record<ItHealthStatus, { label: string; dot: string; text: string; bg: string; badge: string }> = {
  NORMAL: { label: "ปกติ / Normal", dot: "#16a34a", text: "text-emerald-600", bg: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  WARNING: { label: "เฝ้าระวัง / Warning", dot: "#f59e0b", text: "text-amber-600", bg: "bg-amber-500", badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  CRITICAL: { label: "วิกฤต / Critical", dot: "#dc2626", text: "text-red-600", bg: "bg-red-500", badge: "bg-red-500/10 text-red-700 dark:text-red-400" },
  NOT_CHECKED: { label: "ยังไม่ตรวจ / Not checked", dot: "#94a3b8", text: "text-slate-500", bg: "bg-slate-400", badge: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
};

export const MODE_META: Record<ItReportMode, { label: string; text: string }> = {
  AUTO: { label: "🟢 ดึงอัตโนมัติ / Auto", text: "text-emerald-600" },
  CHECK_REQUIRED: { label: "🟡 ต้องตรวจสอบ / Check", text: "text-amber-600" },
  ISSUE: { label: "🔴 พบปัญหา / Issue", text: "text-red-600" },
};

const SEVERITY: Record<ItHealthStatus, number> = { CRITICAL: 3, WARNING: 2, NORMAL: 1, NOT_CHECKED: 0 };

export interface CategoryRollup {
  category: ItSystemCategory;
  total: number;
  normal: number;
  warning: number;
  critical: number;
  notChecked: number;
  worst: ItHealthStatus;
}

export function rollupByCategory(checks: HealthCheck[]): CategoryRollup[] {
  const map = new Map<ItSystemCategory, CategoryRollup>();
  for (const c of checks) {
    let r = map.get(c.category);
    if (!r) {
      r = { category: c.category, total: 0, normal: 0, warning: 0, critical: 0, notChecked: 0, worst: "NOT_CHECKED" };
      map.set(c.category, r);
    }
    r.total++;
    if (c.status === "NORMAL") r.normal++;
    else if (c.status === "WARNING") r.warning++;
    else if (c.status === "CRITICAL") r.critical++;
    else r.notChecked++;
    if (SEVERITY[c.status] > SEVERITY[r.worst]) r.worst = c.status;
  }
  return CATEGORY_ORDER.filter((cat) => map.has(cat)).map((cat) => map.get(cat)!);
}

export interface Kpis {
  total: number;
  checked: number;
  normal: number;
  warning: number;
  critical: number;
  notChecked: number;
  healthPercent: number;
}

export function computeKpis(checks: HealthCheck[]): Kpis {
  let normal = 0, warning = 0, critical = 0, notChecked = 0;
  for (const c of checks) {
    if (c.status === "NORMAL") normal++;
    else if (c.status === "WARNING") warning++;
    else if (c.status === "CRITICAL") critical++;
    else notChecked++;
  }
  const total = checks.length;
  const checked = total - notChecked;
  // Healthy share of what was actually checked; critical weighs double against it.
  const healthPercent = checked > 0 ? Math.round((normal / checked) * 100) : 0;
  return { total, checked, normal, warning, critical, notChecked, healthPercent };
}

/** WARNING/CRITICAL findings, most severe first — the "Need Attention" list. */
export function exceptions(checks: HealthCheck[]): HealthCheck[] {
  return checks
    .filter((c) => c.status === "WARNING" || c.status === "CRITICAL")
    .sort((a, b) => SEVERITY[b.status] - SEVERITY[a.status]);
}

/** The daily checklist items; each maps to a category so the page can mark it
 *  "checked automatically" when an AUTO row exists, or pending otherwise. */
export const CHECKLIST: { key: ItSystemCategory; label: string }[] = [
  { key: "SERVER", label: "ตรวจสุขภาพเซิร์ฟเวอร์ / Check server health" },
  { key: "BACKUP", label: "ตรวจการสำรองข้อมูล / Check backup" },
  { key: "STORAGE", label: "ตรวจพื้นที่จัดเก็บ / Check storage" },
  { key: "CCTV", label: "ตรวจกล้องวงจรปิด (Online + Recording) / Check CCTV" },
  { key: "PHONE", label: "ตรวจโทรศัพท์/แอปพนักงาน / Check phone application" },
  { key: "GPS", label: "ตรวจระบบ GPS / Check GPS" },
  { key: "LOG", label: "ตรวจ Log สำคัญ / Review critical logs" },
  { key: "MANGO_LOGIN", label: "ตรวจ Mango Login / Review Mango login" },
];

export function healthColor(percent: number): string {
  return percent >= 95 ? "#16a34a" : percent >= 85 ? "#f59e0b" : "#dc2626";
}
