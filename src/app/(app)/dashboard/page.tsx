import Link from "next/link";
import {
  LayoutDashboard, Monitor, Users, Building2, MapPin, KeyRound, AppWindow,
  RefreshCcw, Wrench, ShoppingCart, Store, BarChart3, ScrollText,
  ShieldAlert, Settings, UserMinus, Boxes, LifeBuoy,
} from "lucide-react";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { visibleModules } from "@/lib/modules";

export const dynamic = "force-dynamic";

// Resolve a module's icon key to a lucide component (white line icons on navy).
const ICONS: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  overview: LayoutDashboard,
  assets: Monitor,
  employees: Users,
  departments: Building2,
  locations: MapPin,
  vault: KeyRound,
  licenses: AppWindow,
  subscriptions: RefreshCcw,
  maintenance: Wrench,
  procurement: ShoppingCart,
  vendors: Store,
  reports: BarChart3,
  audit: ScrollText,
  security: ShieldAlert,
  settings: Settings,
  offboarding: UserMinus,
  support: LifeBuoy,
  default: Boxes,
};

export default async function DashboardPage() {
  const user = await requireUser();
  const { t, locale } = await getT();
  const modules = visibleModules(user.permissions);

  const now = new Date();
  const online15m = new Date(now.getTime() - 15 * 60 * 1000);

  // Real presence: total active users vs. users seen within the last 15 minutes.
  const [org, totalUsers, onlineSessions] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true },
    }),
    prisma.user.count({
      where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
    }),
    prisma.userSession.findMany({
      where: {
        user: { organizationId: user.organizationId },
        revokedAt: null,
        expiresAt: { gt: now },
        lastSeenAt: { gte: online15m },
      },
      distinct: ["userId"],
      select: { userId: true },
    }),
  ]);

  const onlineUsers = onlineSessions.length;
  const orgName = org?.name ?? t("appName");
  const build = process.env.K_REVISION ?? process.env.APP_BUILD_NO ?? "dev";
  const supportHref = user.permissions.has("support:create") ? "/support/new" : null;
  const firstName = user.name?.split(" ")[0] ?? user.name ?? "";

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      {/* Greeting / module-selection heading */}
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          {t("welcomeBack")}
          {firstName ? `, ${firstName}` : ""} · {orgName}
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
          {t("selectModule")}
        </h1>
      </div>

      {/* Navy module cards */}
      {modules.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          {t("noModuleAccess")}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {modules.map((m) => {
            const Icon = ICONS[m.icon] ?? ICONS.default;
            const label = t(m.labelKey);
            const desc = locale === "en" ? m.descEn : m.descTh;
            return (
              <Link
                key={m.code}
                href={m.route}
                aria-label={label}
                className="group flex aspect-square flex-col items-center justify-center gap-2.5 rounded-2xl px-3 py-4 text-center text-white shadow-[0_4px_10px_rgba(0,0,0,0.12)] outline-none transition-all duration-150 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(0,0,0,0.22)] focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                style={{
                  background: "linear-gradient(155deg, #24386F 0%, #1E2F63 100%)",
                }}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 transition-colors group-hover:bg-white/20">
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <span className="text-sm font-semibold leading-tight">{label}</span>
                <span className="text-[11px] leading-tight text-white/70">{desc}</span>
              </Link>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-auto flex flex-col gap-1 border-t pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          © {now.getFullYear()} {orgName} · {t("appName")}
        </span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            {t("usersOnline")}: <strong className="tabular-nums">{onlineUsers}</strong> {t("ofWord")}{" "}
            <span className="tabular-nums">{totalUsers}</span>
          </span>
          <span className="text-muted-foreground/70">
            {t("build")}: {build}
          </span>
        </span>
      </footer>

      {/* Floating support button */}
      {supportHref && (
        <Link
          href={supportHref}
          aria-label={t("needHelp")}
          className="fixed bottom-6 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          title={t("needHelp")}
        >
          <LifeBuoy className="h-6 w-6" />
        </Link>
      )}
    </div>
  );
}
