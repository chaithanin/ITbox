import Link from "next/link";
import { cn } from "@/lib/utils";

type Tab = "employees" | "onboarding" | "offboarding";

/** Tab strip on the Employees page for People / Joiner / Leaver. */
export function JmlTabs({ active, show }: { active: Tab; show: { onboarding: boolean; offboarding: boolean } }) {
  const tabs: { key: Tab; href: string; label: string; visible: boolean }[] = [
    { key: "employees", href: "/employees", label: "พนักงาน / Employees", visible: true },
    { key: "onboarding", href: "/employees?tab=onboarding", label: "รับเข้า / Onboarding (Joiner)", visible: show.onboarding },
    { key: "offboarding", href: "/employees?tab=offboarding", label: "พ้นสภาพ / Offboarding (Leaver)", visible: show.offboarding },
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b">
      {tabs.filter((t) => t.visible).map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            active === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
