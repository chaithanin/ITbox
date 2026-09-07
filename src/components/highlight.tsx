import type { ReactNode } from "react";

/** Highlights every case-insensitive occurrence of `term` inside `text`.
 *  Server-safe (pure). Use for live-search result emphasis. */
export function Highlight({ text, term }: { text: string | null | undefined; term?: string }): ReactNode {
  const value = text ?? "";
  const q = (term ?? "").trim();
  if (!q || !value) return value;
  // Escape regex metacharacters in the user term.
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = value.split(new RegExp(`(${esc})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === q.toLowerCase()
      ? <mark key={i} className="rounded bg-amber-200 px-0.5 text-inherit dark:bg-amber-500/40">{p}</mark>
      : p
  );
}
