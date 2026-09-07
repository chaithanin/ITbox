"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

/**
 * Live search + filter bar for server-rendered list pages. Typing updates the
 * `q` URL param after a 300ms debounce (no Enter required); the server page
 * re-renders results. `useTransition` drives the loading state, and because
 * navigations supersede one another, stale results never win a race. Enter
 * still works (submits immediately); clearing the box removes `q`.
 */
export function SearchFilterBar({
  action,
  q,
  placeholder = "ค้นหา / Search...",
  filters = [],
  extra,
  debounceMs = 300,
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
  debounceMs?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setValue(q ?? ""); }, [q]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const base = action || pathname;

  function navigate(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    params.delete("page"); // any new query resets to page 1
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${base}?${qs}` : base, { scroll: false }));
  }

  function onSearchChange(v: string) {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate({ q: v.trim() || null }), debounceMs);
  }

  return (
    <form
      className="mb-4 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        navigate({ q: value.trim() || null });
      }}
    >
      <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          name="q"
          value={value}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9 pr-8"
          aria-label="Search"
          autoComplete="off"
        />
        <span className="absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center">
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : value ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => { setValue(""); if (timer.current) clearTimeout(timer.current); navigate({ q: null }); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </span>
      </div>
      {filters.map((f) => (
        <Select
          key={f.name}
          name={f.name}
          defaultValue={f.value ?? ""}
          onChange={(e) => navigate({ [f.name]: e.target.value || null })}
          className="w-auto min-w-[10rem]"
        >
          <option value="">{f.allLabel}</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      ))}
      <Button type="submit" variant="secondary" aria-label="Search">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
      </Button>
      {extra}
    </form>
  );
}
