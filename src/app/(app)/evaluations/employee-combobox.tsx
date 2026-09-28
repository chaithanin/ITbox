"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface EmployeeOption {
  id: string;
  name: string;
  code: string;
}

/**
 * Searchable employee picker for the New assessment form. Filters by name or
 * employee code, sets a hidden `employeeId` input, and shows only the chosen
 * name (per request — no asset/department/position columns).
 */
export function EmployeeCombobox({ employees }: { employees: EmployeeOption[] }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const selected = employees.find((e) => e.id === selectedId) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees.slice(0, 20);
    return employees
      .filter((e) => `${e.name} ${e.code}`.toLowerCase().includes(q))
      .slice(0, 20);
  }, [employees, query]);

  return (
    <div>
      <input type="hidden" name="employeeId" value={selectedId} />
      {selected ? (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{selected.name}</span>
          <button
            type="button"
            onClick={() => { setSelectedId(""); setQuery(""); }}
            className="text-muted-foreground hover:text-foreground"
            aria-label="ล้าง / Clear"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อ หรือรหัสพนักงาน / Search name or staff ID"
              className="pl-9"
              autoComplete="off"
            />
          </div>
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-card shadow-md">
              {matches.map((e) => (
                <button
                  type="button"
                  key={e.id}
                  onClick={() => { setSelectedId(e.id); setQuery(""); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span>{e.name}</span>
                  <span className="text-xs text-muted-foreground">{e.code}</span>
                </button>
              ))}
            </div>
          )}
          {query.trim() && matches.length === 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground shadow-md">
              ไม่พบพนักงาน / No match
            </div>
          )}
        </div>
      )}
    </div>
  );
}
