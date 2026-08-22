import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/shell/app-shell";
import type { NavItem } from "@/components/shell/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { t, locale } = await getT();

  const unreadCount = await prisma.notification.count({
    where: { organizationId: user.organizationId, userId: user.id, readAt: null },
  });

  const has = (p: string) => user.permissions.has(p);
  const nav: NavItem[] = [
    { href: "/dashboard", label: t("dashboard"), icon: "dashboard" },
    ...(has("asset:read") ? [{ href: "/assets", label: t("assets"), icon: "assets" }] : []),
    ...(has("employee:read") ? [{ href: "/employees", label: t("employees"), icon: "employees" }] : []),
    ...(has("department:read") ? [{ href: "/departments", label: t("departments"), icon: "departments" }] : []),
    ...(has("location:read") ? [{ href: "/locations", label: t("locations"), icon: "locations" }] : []),
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
    ...(has("license:read") ? [{ href: "/licenses", label: t("licenses"), icon: "licenses" }] : []),
    ...(has("subscription:read") ? [{ href: "/subscriptions", label: t("subscriptions"), icon: "subscriptions" }] : []),
    ...(has("support:create")
      ? [{
          href: "/support", label: t("itSupport"), icon: "support",
          children: [
            { href: "/support", label: t("myCases") },
            { href: "/support/new", label: t("newCase") },
            { href: "/support/signature", label: "Email Signature" },
            ...(has("support:read")
              ? [
                  { href: "/support/queue", label: t("supportQueue") },
                  { href: "/support/metrics", label: "รายงาน / Metrics" },
                ]
              : []),
            ...(has("support:settings")
              ? [{ href: "/settings/signature", label: "จัดการลายเซ็น / Signatures" }]
              : []),
          ],
        }]
      : []),
    ...(has("maintenance:read") ? [{ href: "/maintenance", label: t("maintenance"), icon: "maintenance" }] : []),
    ...(has("procurement:read") ? [{ href: "/procurement", label: t("procurement"), icon: "procurement" }] : []),
    ...(has("vendor:read") ? [{ href: "/vendors", label: t("vendors"), icon: "vendors" }] : []),
    ...(has("offboarding:read") ? [{ href: "/offboarding", label: t("offboarding"), icon: "offboarding" }] : []),
    ...(has("report:read") ? [{ href: "/reports", label: t("reports"), icon: "reports" }] : []),
    { href: "/notifications", label: t("notifications"), icon: "notifications" },
    ...(has("audit:read") ? [{ href: "/audit-logs", label: t("auditLogs"), icon: "audit" }] : []),
    ...(has("security:read") ? [{ href: "/security", label: t("securityCenter"), icon: "security" }] : []),
    ...(has("user:manage") || has("settings:manage")
      ? [{ href: "/settings", label: t("settings"), icon: "settings" }]
      : []),
  ];

  return (
    <AppShell
      navItems={nav}
      appName={t("appName")}
      userName={user.name}
      userEmail={user.email}
      unreadCount={unreadCount}
      locale={locale}
      labels={{ search: t("search"), logout: t("logout"), profile: t("profile") }}
    >
      {children}
    </AppShell>
  );
}
