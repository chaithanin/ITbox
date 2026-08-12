"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { Menu, Moon, Sun, Bell, Search, LogOut, User, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function Topbar({
  userName,
  userEmail,
  unreadCount,
  locale,
  onMenuClick,
  labels,
}: {
  userName: string;
  userEmail: string;
  unreadCount: number;
  locale: string;
  onMenuClick: () => void;
  labels: { search: string; logout: string; profile: string };
}) {
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const toggleLocale = () => {
    const next = locale === "th" ? "en" : "th";
    document.cookie = `locale=${next};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card/80 px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>
      <form onSubmit={onSearch} className="relative hidden max-w-sm flex-1 sm:block">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={labels.search}
          className="pl-9"
        />
      </form>
      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggleLocale} title="ไทย / English">
          <Languages className="h-4 w-4" />
          <span className="sr-only">Language</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" asChild>
          <Link href="/notifications" className="relative">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {userName.slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden max-w-[10rem] truncate text-sm md:inline">{userName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="truncate text-sm font-medium">{userName}</div>
              <div className="truncate text-xs font-normal text-muted-foreground">{userEmail}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile"><User className="mr-2 h-4 w-4" />{labels.profile}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/login" })}>
              <LogOut className="mr-2 h-4 w-4" />
              {labels.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
