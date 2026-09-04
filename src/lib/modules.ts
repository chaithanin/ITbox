/**
 * ERP module registry — the single source of truth for the module-selection
 * dashboard (the navy "module cards" grid). Every entry maps to a REAL module
 * that already exists in the app, with its real route, real i18n label and the
 * real RBAC permission that gates it. Nothing here is mock data.
 *
 * A module with no `permission` is always visible. Otherwise it appears only
 * when the current user holds that permission — the same predicate the sidebar
 * (src/app/(app)/layout.tsx) uses, kept intentionally consistent.
 *
 * `icon` matches the lucide icon keys resolved in the dashboard grid.
 */
import type { DictKey } from "@/lib/i18n";
import { PROCUREMENT_ENABLED } from "@/lib/features";

export interface ModuleDef {
  /** Stable module code (analytics / deep-links / future config). */
  code: string;
  /** i18n dictionary key for the module name (reused from navigation). */
  labelKey: DictKey;
  /** Short bilingual description shown under the module name. */
  descTh: string;
  descEn: string;
  /** lucide icon key (see ICON map in the dashboard page). */
  icon: string;
  /** Destination route when the card is activated. */
  route: string;
  /**
   * RBAC permission(s) required to see the module. A single string requires
   * exactly that permission; an array is any-of (holds at least one). Undefined
   * means the module is always visible.
   */
  permission?: string | string[];
  /** Display order in the grid. */
  sortOrder: number;
}

export const MODULES: ModuleDef[] = [
  {
    code: "overview",
    labelKey: "overview",
    descTh: "ภาพรวมและสถิติระบบ",
    descEn: "Analytics & KPIs",
    icon: "overview",
    route: "/dashboard/overview",
    // Org-wide analytics incl. security/audit aggregates — gated behind the
    // reporting permission (page enforces the same via requirePermission).
    permission: "report:read",
    sortOrder: 10,
  },
  {
    code: "assets",
    labelKey: "assets",
    descTh: "ทะเบียนทรัพย์สินไอที",
    descEn: "IT asset register",
    icon: "assets",
    route: "/assets",
    permission: "asset:read",
    sortOrder: 20,
  },
  {
    code: "borrow",
    labelKey: "borrowReturn",
    descTh: "ยืม-คืนทรัพย์สินไอที",
    descEn: "Borrow & return assets",
    icon: "borrow",
    route: "/borrow",
    permission: "borrow:read",
    sortOrder: 25,
  },
  {
    code: "vault",
    labelKey: "vault",
    descTh: "ตู้เซฟรหัสผ่าน",
    descEn: "Encrypted secrets",
    icon: "vault",
    route: "/vault",
    permission: "vault:read",
    sortOrder: 30,
  },
  {
    code: "support",
    labelKey: "itSupport",
    descTh: "ระบบแจ้งปัญหา IT",
    descEn: "Help desk & tickets",
    icon: "support",
    route: "/support",
    permission: "support:create",
    sortOrder: 40,
  },
  {
    code: "licenses",
    labelKey: "licenses",
    descTh: "ไลเซนส์ซอฟต์แวร์",
    descEn: "Software licenses",
    icon: "licenses",
    route: "/licenses",
    permission: "license:read",
    sortOrder: 50,
  },
  {
    code: "subscriptions",
    labelKey: "subscriptions",
    descTh: "บริการรายเดือน",
    descEn: "Recurring services",
    icon: "subscriptions",
    route: "/subscriptions",
    permission: "subscription:read",
    sortOrder: 60,
  },
  {
    code: "maintenance",
    labelKey: "maintenance",
    descTh: "งานแจ้งซ่อม",
    descEn: "Repair tickets",
    icon: "maintenance",
    route: "/maintenance",
    permission: "maintenance:read",
    sortOrder: 70,
  },
  {
    code: "procurement",
    labelKey: "procurement",
    descTh: "คำขอจัดซื้อ",
    descEn: "Purchase requests",
    icon: "procurement",
    route: "/procurement",
    permission: "procurement:read",
    sortOrder: 80,
  },
  {
    code: "vendors",
    labelKey: "vendors",
    descTh: "ทะเบียนผู้ขาย",
    descEn: "Vendor directory",
    icon: "vendors",
    route: "/vendors",
    permission: "vendor:read",
    sortOrder: 90,
  },
  {
    code: "employees",
    labelKey: "employees",
    descTh: "ข้อมูลพนักงาน",
    descEn: "Staff directory",
    icon: "employees",
    route: "/employees",
    permission: "employee:read",
    sortOrder: 100,
  },
  {
    code: "departments",
    labelKey: "departments",
    descTh: "โครงสร้างแผนก",
    descEn: "Departments",
    icon: "departments",
    route: "/departments",
    permission: "department:read",
    sortOrder: 110,
  },
  {
    code: "locations",
    labelKey: "locations",
    descTh: "สถานที่ตั้ง",
    descEn: "Sites & locations",
    icon: "locations",
    route: "/locations",
    permission: "location:read",
    sortOrder: 120,
  },
  {
    code: "offboarding",
    labelKey: "offboarding",
    descTh: "พนักงานลาออก",
    descEn: "Employee exit",
    icon: "offboarding",
    route: "/offboarding",
    permission: "offboarding:read",
    sortOrder: 130,
  },
  {
    code: "reports",
    labelKey: "reports",
    descTh: "รายงานและส่งออก",
    descEn: "Reports & export",
    icon: "reports",
    route: "/reports",
    permission: "report:read",
    sortOrder: 140,
  },
  {
    code: "security",
    labelKey: "securityCenter",
    descTh: "ศูนย์ความปลอดภัย",
    descEn: "Security center",
    icon: "security",
    route: "/security",
    permission: "security:read",
    sortOrder: 150,
  },
  {
    code: "audit",
    labelKey: "auditLogs",
    descTh: "บันทึกการตรวจสอบ",
    descEn: "Audit trail",
    icon: "audit",
    route: "/audit-logs",
    permission: "audit:read",
    sortOrder: 160,
  },
  {
    code: "settings",
    labelKey: "settings",
    descTh: "ตั้งค่าระบบและผู้ใช้",
    descEn: "System & users",
    icon: "settings",
    route: "/settings",
    permission: ["settings:manage", "user:manage"],
    sortOrder: 170,
  },
];

function allowed(perms: ReadonlySet<string>, need: ModuleDef["permission"]): boolean {
  if (!need) return true;
  if (Array.isArray(need)) return need.some((p) => perms.has(p));
  return perms.has(need);
}

/** Modules the given permission set may see, in display order. */
export function visibleModules(perms: ReadonlySet<string>): ModuleDef[] {
  return MODULES.filter((m) => allowed(perms, m.permission))
    .filter((m) => PROCUREMENT_ENABLED || m.code !== "procurement")
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
