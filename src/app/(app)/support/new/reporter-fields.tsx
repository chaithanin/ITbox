"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DirEntry {
  id: string;
  employeeCode: string;
  fullName: string;
  position: string;
  department: string;
  departmentId: string;
  location: string;
  locationId: string;
}

export function ReporterFields({
  defaultName,
  defaultCode,
}: {
  defaultName: string;
  defaultCode: string;
}) {
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState(defaultCode);
  const [picked, setPicked] = useState<DirEntry | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/employees/directory?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const body = (await res.json().catch(() => null)) as { data?: DirEntry[] } | null;
        setResults(res.ok && body?.data ? body.data : []);
        setOpen(true);
      } catch {
        /* aborted / network error */
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(e: DirEntry) {
    setName(e.fullName);
    setCode(e.employeeCode);
    setPicked(e);
    setQuery("");
    setResults([]);
    setOpen(false);
    // Auto-fill the Location select (uncontrolled native <select>) if the
    // employee's location exists as an option.
    if (e.locationId && typeof document !== "undefined") {
      const sel = document.getElementById("locationId") as HTMLSelectElement | null;
      if (sel && Array.from(sel.options).some((o) => o.value === e.locationId)) {
        sel.value = e.locationId;
      }
    }
    // Tell the device picker to load this employee's held assets.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("reporter-employee", {
          detail: { employeeId: e.id, employeeName: e.fullName },
        })
      );
    }
  }

  return (
    <div className="space-y-4">
      <div ref={boxRef} className="relative">
        <Label htmlFor="reporterSearch">เลือกพนักงาน / Find employee</Label>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="reporterSearch"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="พิมพ์ชื่อ / รหัส / ตำแหน่ง แล้วเลือกเพื่อเติมชื่อและรหัสให้อัตโนมัติ…"
            className="pl-9 pr-9"
            autoComplete="off"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        {open && (results.length > 0 || (query.trim().length >= 2 && !loading)) && (
          <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-card shadow-lg">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">ไม่พบพนักงาน / No matches</p>
            ) : (
              results.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => pick(e)}
                  className="flex w-full items-start gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent"
                >
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{e.fullName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[e.employeeCode, e.position, e.department].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {picked && (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          เติมจาก <span className="font-medium text-foreground">{picked.fullName}</span>
          {picked.department ? ` · แผนก ${picked.department}` : ""}
          {picked.location ? ` · สถานที่ ${picked.location} (เลือกให้อัตโนมัติ)` : ""}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="reporterName">
            ชื่อผู้แจ้ง / Reporter name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="reporterName"
            name="reporterName"
            required
            maxLength={120}
            className="mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="reporterEmployeeCode">รหัสพนักงาน / Staff ID</Label>
          <Input
            id="reporterEmployeeCode"
            name="reporterEmployeeCode"
            maxLength={50}
            className="mt-1"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="เช่น EMP-0001"
          />
        </div>
      </div>
    </div>
  );
}
