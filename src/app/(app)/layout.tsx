import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { PROCUREMENT_ENABLED } from "@/lib/features";
import { AppShell } from "@/components/shell/app-shell";
import type { NavGroup, NavItem } from "@/components/shell/sidebar";
import { KpiPopup } from "@/components/kpi-popup";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t, locale } = await getT();

  const has = (p: string) => user.permissions.has(p);
  const isAgent = has("support:work") || has("support:read");

  const [unreadCount, dbUser] = await Promise.all([
    prisma.notification.count({
      where: { organizationId: user.organizationId, userId: user.id, readAt: null },
    }),
    isAgent
      ? prisma.user.findUnique({ where: { id: user.id }, select: { kpiPopupMode: true } })
      : Promise.resolve(null),
  ]);
  const kpiPopupMode = dbUser?.kpiPopupMode ?? "DAILY";

  // ─────────────────────────────────────────────────────────────────────────
  // Navigation: a standalone Dashboard link, then 6 permission-gated groups,
  // then the footer (Notifications / Settings). Every item is gated by the same
  // permission the destination page enforces; empty groups are dropped.
  // ─────────────────────────────────────────────────────────────────────────

  // Standalone top link.
  const navHeader: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  ];

  // บุคลากรและสิทธิ์ / People & Access
  const people: NavItem[] = [
    ...(has("employee:read") ? [{ href: "/employees", label: "พนักงาน / Employees", icon: "employees" }] : []),
    ...(has("user:manage") ? [{ href: "/settings/users", label: "ผู้ใช้งาน / Users", icon: "people" }] : []),
    ...(has("department:read") ? [{ href: "/departments", label: "แผนก / Departments", icon: "departments" }] : []),
    ...(has("role:manage") ? [{ href: "/settings/roles", label: "Roles & Permissions", icon: "security" }] : []),
    ...(has("accessreq:read") ? [{ href: "/access-requests", label: "คำขอสิทธิ์ / Access Requests", icon: "onboarding" }] : []),
    ...((has("onboarding:read") || has("offboarding:read"))
      ? [{
          href: "/employees?tab=onboarding", label: "Onboarding / Offboarding", icon: "offboarding",
          children: [
            ...(has("onboarding:read") ? [{ href: "/employees?tab=onboarding", label: "รับเข้า / Onboarding" }] : []),
            ...(has("offboarding:read") ? [{ href: "/employees?tab=offboarding", label: "พ้นสภาพ / Offboarding" }] : []),
          ],
        }]
      : []),
  ];

  // Service Desk
  const support: NavItem[] = [
    ...(has("support:create")
      ? [{
          href: "/support", label: "แจ้งซ่อม / Help Desk", icon: "support",
          children: [
            { href: "/support", label: t("myCases") },
            { href: "/support/new", label: t("newCase") },
            { href: "/support/signature", label: "Email Signature" },
            ...(has("support:work") || has("support:read")
              ? [{ href: "/support/performance", label: "ผลงานของฉัน / My Performance" }]
              : []),
            ...(has("support:read")
              ? [
                  { href: "/support/queue", label: t("supportQueue") },
                  { href: "/support/metrics", label: "รายงาน / Metrics" },
                ]
              : []),
            ...(has("support:settings")
              ? [
                  { href: "/settings/kpi", label: "ตั้งค่า KPI / KPI Config" },
                  { href: "/settings/signature", label: "จัดการลายเซ็น / Signatures" },
                ]
              : []),
          ],
        }]
      : []),
    ...(has("support:settings") ? [{ href: "/settings/support/agent-leave", label: "วันหยุดเจ้าหน้าที่ / Agent Days Off", icon: "offboarding" }] : []),
    ...(has("maintenance:read") ? [{ href: "/maintenance", label: "งานซ่อม / Maintenance", icon: "maintenance" }] : []),
    ...(has("catalog:read") ? [{ href: "/catalog", label: "Service Catalog", icon: "catalog" }] : []),
    ...(has("kb:read") ? [{ href: "/kb", label: "Knowledge Base", icon: "kb" }] : []),
    ...(has("problem:read") ? [{ href: "/problems", label: "Problem Management", icon: "problems" }] : []),
    ...(has("change:read") ? [{ href: "/changes", label: "Change Management", icon: "changes" }] : []),
  ];

  // Assets & Procurement
  const assets: NavItem[] = [
    ...(has("asset:read") ? [{ href: "/assets", label: "ทรัพย์สินไอที / IT Assets", icon: "assets" }] : []),
    ...(has("borrow:read")
      ? [{
          href: "/borrow", label: "ยืม–คืน / Borrow & Return", icon: "borrow",
          children: [
            { href: "/borrow", label: "ภาพรวม / Dashboard" },
            ...(has("borrow:create") ? [{ href: "/borrow/new", label: "ขอยืมใหม่ / New Request" }] : []),
            ...(has("borrow:approve") ? [{ href: "/borrow/approvals", label: "รออนุมัติ / Approvals" }] : []),
            ...(has("borrow:issue") ? [{ href: "/borrow/issue", label: "จ่าย-รับมอบ / Issue" }] : []),
            ...(has("borrow:return") ? [{ href: "/borrow/returns", label: "รับคืน / Returns" }] : []),
          ],
        }]
      : []),
    ...(has("license:read") ? [{ href: "/licenses", label: "Software Licenses", icon: "licenses" }] : []),
    ...(has("subscription:read") ? [{ href: "/subscriptions", label: "Subscriptions", icon: "subscriptions" }] : []),
    ...(has("sim:read") ? [{ href: "/sim", label: "SIM / Mobile", icon: "sim" }] : []),
    ...(has("vendor:read") ? [{ href: "/vendors", label: "Vendors", icon: "vendors" }] : []),
    ...(has("contract:read") ? [{ href: "/contracts", label: "Contracts", icon: "contracts" }] : []),
    ...(PROCUREMENT_ENABLED && has("procurement:read") ? [{ href: "/procurement", label: t("procurement"), icon: "procurement" }] : []),
  ];

  // Infrastructure
  const infrastructure: NavItem[] = [
    ...(has("monitoring:read") ? [{ href: "/monitoring", label: "Monitoring", icon: "monitoring" }] : []),
    ...(has("network:read") ? [{
      href: "/network", label: "Network", icon: "network",
      children: [
        { href: "/network", label: "อุปกรณ์ / Devices" },
        { href: "/network/ipam", label: "IP / Subnet / VLAN" },
      ],
    }] : []),
    ...(has("cctv:view")
      ? [{
          href: "/cctv", label: "CCTV", icon: "cctv",
          children: [
            { href: "/cctv", label: "ภาพรวม / Overview" },
            { href: "/cctv/devices", label: "เครื่องบันทึก / Recorders" },
            { href: "/cctv/cameras", label: "กล้อง / Cameras" },
            { href: "/cctv/screenshots", label: "ภาพ Snapshot / Screenshots" },
            { href: "/cctv/incidents", label: "เหตุการณ์ / Incidents" },
            { href: "/cctv/reports", label: "รายงาน / Reports" },
            ...(has("cctv:manage") ? [{ href: "/cctv/settings", label: "ตั้งค่า / Settings" }] : []),
            ...(has("cctv:manage") ? [{ href: "/cctv/import", label: "นำเข้า device.xml / Import" }] : []),
          ],
        }]
      : []),
    ...(has("cmdb:read") ? [{ href: "/cmdb", label: "CMDB", icon: "cmdb" }] : []),
    ...(has("backup:read") ? [{ href: "/backup", label: "Backup & DR", icon: "backup" }] : []),
  ];

  // Security
  const security: NavItem[] = [
    ...(has("security:read") ? [{ href: "/security", label: "Security Center", icon: "security" }] : []),
    ...(has("monitoring:read") ? [{ href: "/endpoints", label: "Endpoint Security", icon: "endpoints" }] : []),
    ...(has("vuln:read") ? [{ href: "/vulnerabilities", label: "Vulnerabilities", icon: "vulnerabilities" }] : []),
    ...(has("vault:read")
      ? [{
          href: "/vault", label: "Password Vault", icon: "vault",
          children: [
            { href: "/vault", label: t("vaultAll") },
            { href: "/vault/shared", label: t("vaultShared") },
            { href: "/vault/favorites", label: t("vaultFavorites") },
            { href: "/vault/rotation", label: t("vaultRotation") },
            { href: "/vault/emergency", label: t("vaultEmergency") },
            { href: "/vault/security", label: t("vaultSecurity") },
          ],
        }]
      : []),
    ...(has("audit:read") ? [{ href: "/audit-logs", label: "Audit Logs", icon: "audit" }] : []),
  ];

  // Reports & Documents
  const reports: NavItem[] = [
    ...(has("report:read") ? [{ href: "/dashboard/it-dashboard", label: "IT Dashboard", icon: "reports" }] : []),
    ...(has("report:read") ? [{ href: "/it-report", label: "IT Support Report", icon: "reports" }] : []),
    ...(has("report:read") ? [{ href: "/reports", label: "Reports", icon: "reports" }] : []),
    { href: "/documents", label: "Documents", icon: "contracts" },
  ];

  const groupDefs: NavGroup[] = [
    { id: "people", label: "บุคลากรและสิทธิ์ / People & Access", icon: "people", items: people },
    { id: "support", label: "Service Desk", icon: "support", items: support },
    { id: "assets", label: "Assets & Procurement", icon: "assets", items: assets },
    { id: "infrastructure", label: "Infrastructure", icon: "infrastructure", items: infrastructure },
    { id: "security", label: "Security", icon: "securityWs", items: security },
    { id: "reports", label: "Reports & Documents", icon: "reports", items: reports },
  ];
  const navGroups = groupDefs.filter((g) => g.items.length > 0);

  const navFooter: NavItem[] = [
    { href: "/notifications", label: t("notifications"), icon: "notifications" },
    ...(has("user:manage") || has("settings:manage")
      ? [{ href: "/settings", label: t("settings"), icon: "settings" }]
      : []),
  ];

  return (
    <AppShell
      navHeader={navHeader}
      navGroups={navGroups}
      navFooter={navFooter}
      appName={t("appName")}
      userName={user.name}
      userEmail={user.email}
      unreadCount={unreadCount}
      locale={locale}
      labels={{ search: t("search"), logout: t("logout"), profile: t("profile") }}
    >
      {children}
      {isAgent && <KpiPopup mode={kpiPopupMode} />}
    </AppShell>
  );
}
