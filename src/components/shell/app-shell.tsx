"use client";

import { useState } from "react";
import { Sidebar, type NavGroup, type NavItem } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({
  navGroups,
  navFooter,
  appName,
  userName,
  userEmail,
  unreadCount,
  locale,
  labels,
  children,
}: {
  navGroups: NavGroup[];
  navFooter: NavItem[];
  appName: string;
  userName: string;
  userEmail: string;
  unreadCount: number;
  locale: string;
  labels: { search: string; logout: string; profile: string };
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <Sidebar
        groups={navGroups}
        footer={navFooter}
        appName={appName}
        open={open}
        onClose={() => setOpen(false)}
      />
      <div className="lg:pl-64">
        <Topbar
          userName={userName}
          userEmail={userEmail}
          unreadCount={unreadCount}
          locale={locale}
          onMenuClick={() => setOpen(true)}
          labels={labels}
        />
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
