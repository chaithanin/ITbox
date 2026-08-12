import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

/** GET-based search/filter bar for server-rendered list pages. */
export function SearchFilterBar({
  action,
  q,
  placeholder = "ค้นหา / Search...",
  filters = [],
  extra,
}: {
  action: string;
  q?: string;
  placeholder?: string;
  filters?: {
    name: string;
    value?: string;
    options: { value: string; label: string }[];
    allLabel: string;
  }[];
  extra?: React.ReactNode;
}) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="pl-9" />
      </div>
      {filters.map((f) => (
        <Select key={f.name} name={f.name} defaultValue={f.value ?? ""} className="w-auto min-w-[10rem]">
          <option value="">{f.allLabel}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
      <Button type="submit" variant="secondary">
        <Search className="h-4 w-4" />
      </Button>
      {extra}
    </form>
  );
}

/** Pagination controls preserving existing query params. */
export function Pagination({
  page,
  pageCount,
  basePath,
  searchParams,
}: {
  page: number;
  pageCount: number;
  basePath: string;
  searchParams?: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;
  const mk = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams ?? {})) {
      if (v && k !== "page") sp.set(k, v);
    }
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {page} / {pageCount}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" asChild disabled={page <= 1}>
          <Link href={mk(Math.max(1, page - 1))} aria-disabled={page <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild disabled={page >= pageCount}>
          <Link href={mk(Math.min(pageCount, page + 1))} aria-disabled={page >= pageCount}>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function parsePage(v: string | undefined, pageSize = 20) {
  const page = Math.max(1, Number(v) || 1);
  return { page, skip: (page - 1) * pageSize, take: pageSize };
}
