"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Monitor, Users, Building2, MapPin, KeyRound, AppWindow,
  RefreshCcw, Wrench, ShoppingCart, Store, BarChart3, Bell, ScrollText,
  ShieldAlert, Settings, UserMinus, Boxes, LifeBuoy,
  Router, GitPullRequest, DatabaseBackup, FileText, Bug, BookOpen, ShieldX, Network,
  UserPlus, LayoutGrid, Activity, MonitorSmartphone, Cctv, HandHelping, ChevronDown, Smartphone,
  Server, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";

export interface NavItem {
  href: string;
  label: string;
  icon?: string;
  permission?: string;
  children?: { href: string; label: string }[];
}

/**
 * A Workspace: a primary navigation group that collapses to a single header.
 * `items` keep their existing shape (including per-item sub-menus), so grouping
 * is purely additive — no route, permission gate, or sub-page is lost.
 */
export interface NavGroup {
  id: string;
  label: string;
  icon: string;
  items: NavItem[];
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  assets: Monitor,
  borrow: HandHelping,
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
  sim: Smartphone,
  cctv: Cctv,
  infrastructure: Server,
  people: Users,
  securityWs: ShieldCheck,
  default: Boxes,
};

const STORAGE_KEY = "itbox.nav.collapsed";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

function groupIsActive(pathname: string, group: NavGroup) {
  return group.items.some(
    (i) =>
      isActive(pathname, i.href) ||
      (i.children ?? []).some((c) => pathname === c.href || pathname.startsWith(c.href + "/"))
  );
}

function NavLink({
  item,
  pathname,
  onClose,
}: {
  item: NavItem;
  pathname: string;
  onClose: () => void;
}) {
  const Icon = item.icon ? ICONS[item.icon] ?? ICONS.default : null;
  const active = isActive(pathname, item.href);
  return (
    <div>
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
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <span className="truncate">{item.label}</span>
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
}

export function Sidebar({
  header = [],
  groups,
  footer,
  appName,
  open,
  onClose,
}: {
  header?: NavItem[];
  groups: NavGroup[];
  footer: NavItem[];
  appName: string;
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  // Which workspaces the user has explicitly collapsed (persisted per browser).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCollapsed(JSON.parse(raw));
    } catch {
      /* ignore unavailable/broken storage */
    }
  }, []);

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

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
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {header.length > 0 && (
            <div className="mb-1 space-y-0.5">
              {header.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onClose={onClose} />
              ))}
            </div>
          )}
          {groups.map((group) => {
            const GroupIcon = ICONS[group.icon] ?? ICONS.default;
            const active = groupIsActive(pathname, group);
            // Expanded when: the user hasn't collapsed it, OR a child route is
            // active (an active workspace always shows its items).
            const expanded = active || !collapsed[group.id];
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggle(group.id)}
                  aria-expanded={expanded}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground/70 hover:text-foreground"
                  )}
                >
                  <GroupIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "ml-auto h-3.5 w-3.5 shrink-0 transition-transform",
                      expanded ? "" : "-rotate-90"
                    )}
                  />
                </button>
                {expanded && (
                  <div className="mt-0.5 space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        pathname={pathname}
                        onClose={onClose}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {footer.length > 0 && (
            <div className="mt-2 space-y-0.5 border-t pt-2">
              {footer.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onClose={onClose} />
              ))}
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
