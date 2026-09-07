import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

// The live search/filter bar is a client component; re-exported here so the
// many pages that `import { SearchFilterBar } from "@/components/list-controls"`
// keep working, while parsePage stays server-callable.
export { SearchFilterBar } from "@/components/search-filter-bar";

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
  // Windowed page list with ellipses: 1 … 4 5 [6] 7 8 … 57
  const items: (number | "…")[] = [];
  const keep = new Set<number>([1, pageCount]);
  for (let p = page - 1; p <= page + 1; p++) if (p >= 1 && p <= pageCount) keep.add(p);
  let prev = 0;
  for (const p of [...keep].sort((a, b) => a - b)) {
    if (p - prev > 1) items.push("…");
    items.push(p);
    prev = p;
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-1">
      <Button variant="outline" size="sm" asChild disabled={page <= 1}>
        <Link href={mk(Math.max(1, page - 1))} aria-disabled={page <= 1} aria-label="Previous">
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </Button>
      {items.map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="px-1.5 text-sm text-muted-foreground">…</span>
        ) : it === page ? (
          <Button key={it} size="sm" className="min-w-9" aria-current="page">{it}</Button>
        ) : (
          <Button key={it} variant="outline" size="sm" className="min-w-9" asChild>
            <Link href={mk(it)}>{it}</Link>
          </Button>
        )
      )}
      <Button variant="outline" size="sm" asChild disabled={page >= pageCount}>
        <Link href={mk(Math.min(pageCount, page + 1))} aria-disabled={page >= pageCount} aria-label="Next">
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}

export function parsePage(v: string | undefined, pageSize = 20) {
  const page = Math.max(1, Number(v) || 1);
  return { page, skip: (page - 1) * pageSize, take: pageSize };
}
