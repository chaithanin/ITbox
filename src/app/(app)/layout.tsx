import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
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
  // Workspaces: the ~30 permission-gated modules grouped into 8 primary areas.
  // Grouping is organizational only — every href, permission gate and sub-menu
  // is identical to before; empty workspaces (no visible items) are dropped.
  // ─────────────────────────────────────────────────────────────────────────

  const overview: NavItem[] = [
    { href: "/dashboard", label: t("dashboard"), icon: "dashboard" },
    ...(has("report:read") ? [{ href: "/dashboard/it-dashboard", label: "IT Dashboard", icon: "reports" }] : []),
    ...(has("report:read") ? [{ href: "/it-report", label: "IT Support Report", icon: "reports" }] : []),
  ];

  const people: NavItem[] = [
    ...(has("employee:read")
      ? [{
          href: "/employees", label: t("employees"), icon: "employees",
          children: [
            { href: "/employees", label: t("employees") },
            ...(has("onboarding:read") ? [{ href: "/employees?tab=onboarding", label: "รับเข้า / Onboarding" }] : []),
            ...(has("offboarding:read") ? [{ href: "/employees?tab=offboarding", label: "พ้นสภาพ / Offboarding" }] : []),
          ],
        }]
      : []),
    ...(has("department:read") ? [{ href: "/departments", label: t("departments"), icon: "departments" }] : []),
    ...(has("location:read") ? [{ href: "/locations", label: t("locations"), icon: "locations" }] : []),
  ];

  const assets: NavItem[] = [
    ...(has("asset:read") ? [{ href: "/assets", label: t("assets"), icon: "assets" }] : []),
    ...(has("borrow:read")
      ? [{
          href: "/borrow", label: "ยืม-คืนทรัพย์สิน / Borrow & Return", icon: "borrow",
          children: [
            { href: "/borrow", label: "ภาพรวม / Dashboard" },
            ...(has("borrow:create") ? [{ href: "/borrow/new", label: "ขอยืมใหม่ / New Request" }] : []),
            ...(has("borrow:approve") ? [{ href: "/borrow/approvals", label: "รออนุมัติ / Approvals" }] : []),
            ...(has("borrow:issue") ? [{ href: "/borrow/issue", label: "จ่าย-รับมอบ / Issue" }] : []),
            ...(has("borrow:return") ? [{ href: "/borrow/returns", label: "รับคืน / Returns" }] : []),
          ],
        }]
      : []),
    ...(has("maintenance:read") ? [{ href: "/maintenance", label: t("maintenance"), icon: "maintenance" }] : []),
  ];

  const support: NavItem[] = [
    ...(has("support:create")
      ? [{
          href: "/support", label: t("itSupport"), icon: "support",
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
  ];

  const infrastructure: NavItem[] = [
    ...(has("network:read") ? [{
      href: "/network", label: "เครือข่าย / Network", icon: "network",
      children: [
        { href: "/network", label: "อุปกรณ์ / Devices" },
        { href: "/network/ipam", label: "IP / Subnet / VLAN" },
      ],
    }] : []),
    ...(has("change:read") ? [{ href: "/changes", label: "Change Management", icon: "changes" }] : []),
    ...(has("problem:read") ? [{ href: "/problems", label: "Problem Management", icon: "problems" }] : []),
    ...(has("kb:read") ? [{ href: "/kb", label: "Knowledge Base", icon: "kb" }] : []),
    ...(has("cmdb:read") ? [{ href: "/cmdb", label: "CMDB", icon: "cmdb" }] : []),
    ...(has("monitoring:read") ? [{ href: "/monitoring", label: "Monitoring", icon: "monitoring" }] : []),
    ...(has("monitoring:read") ? [{ href: "/endpoints", label: "Endpoint Security", icon: "endpoints" }] : []),
    ...(has("cctv:view")
      ? [{
          href: "/cctv", label: "CCTV Monitoring", icon: "cctv",
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
    ...(has("catalog:read") ? [{ href: "/catalog", label: "Service Catalog", icon: "catalog" }] : []),
    ...(has("backup:read") ? [{ href: "/backup", label: "Backup & DR", icon: "backup" }] : []),
  ];

  const procurement: NavItem[] = [
    ...(has("procurement:read") ? [{ href: "/procurement", label: t("procurement"), icon: "procurement" }] : []),
    ...(has("vendor:read") ? [{ href: "/vendors", label: t("vendors"), icon: "vendors" }] : []),
    ...(has("license:read") ? [{ href: "/licenses", label: t("licenses"), icon: "licenses" }] : []),
    ...(has("subscription:read") ? [{ href: "/subscriptions", label: t("subscriptions"), icon: "subscriptions" }] : []),
    ...(has("contract:read") ? [{ href: "/contracts", label: "สัญญา / Contracts", icon: "contracts" }] : []),
  ];

  const security: NavItem[] = [
    ...(has("vault:read")
      ? [{
          href: "/vault", label: t("vault"), icon: "vault",
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
    ...(has("security:read") ? [{ href: "/security", label: t("securityCenter"), icon: "security" }] : []),
    ...(has("vuln:read") ? [{ href: "/vulnerabilities", label: "ช่องโหว่ / Vulnerabilities", icon: "vulnerabilities" }] : []),
    ...(has("audit:read") ? [{ href: "/audit-logs", label: t("auditLogs"), icon: "audit" }] : []),
  ];

  const reports: NavItem[] = [
    ...(has("report:read") ? [{ href: "/reports", label: t("reports"), icon: "reports" }] : []),
  ];

  const groupDefs: NavGroup[] = [
    { id: "overview", label: t("wsOverview"), icon: "dashboard", items: overview },
    { id: "people", label: t("wsPeople"), icon: "people", items: people },
    { id: "assets", label: t("wsAssets"), icon: "assets", items: assets },
    { id: "support", label: t("wsSupport"), icon: "support", items: support },
    { id: "infrastructure", label: t("wsInfrastructure"), icon: "infrastructure", items: infrastructure },
    { id: "procurement", label: t("wsProcurement"), icon: "procurement", items: procurement },
    { id: "security", label: t("wsSecurity"), icon: "securityWs", items: security },
    { id: "reports", label: t("wsReports"), icon: "reports", items: reports },
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
