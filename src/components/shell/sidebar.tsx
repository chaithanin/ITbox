"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Monitor, Users, Building2, MapPin, KeyRound, AppWindow,
  RefreshCcw, Wrench, ShoppingCart, Store, BarChart3, Bell, ScrollText,
  ShieldAlert, Settings, UserMinus, Boxes, LifeBuoy,
  Router, GitPullRequest, DatabaseBackup, FileText, Bug, BookOpen, ShieldX, Network,
  UserPlus, LayoutGrid, Activity, MonitorSmartphone, Cctv,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: string;
  children?: { href: string; label: string }[];
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
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
  notifications: Bell,
  audit: ScrollText,
  security: ShieldAlert,
  settings: Settings,
  offboarding: UserMinus,
  support: LifeBuoy,
  network: Router,
  changes: GitPullRequest,
  backup: DatabaseBackup,
  contracts: FileText,
  problems: Bug,
  kb: BookOpen,
  vulnerabilities: ShieldX,
  cmdb: Network,
  onboarding: UserPlus,
  catalog: LayoutGrid,
  monitoring: Activity,
  endpoints: MonitorSmartphone,
  cctv: Cctv,
  default: Boxes,
};

export function Sidebar({
  items,
  appName,
  open,
  onClose,
}: {
  items: NavItem[];
  appName: string;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <BrandLogo className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight">{appName}</span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {items.map((item) => {
            const Icon = ICONS[item.icon] ?? ICONS.default;
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
                {active && item.children && (
                  <div className="ml-9 mt-0.5 space-y-0.5 border-l pl-3">
                    {item.children.map((c) => (
                      <Link
                        key={c.href}
                        href={c.href}
                        onClick={onClose}
                        className={cn(
                          "block rounded px-2 py-1 text-xs transition-colors",
                          pathname === c.href
                            ? "font-medium text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
