"use client";

/**
 * Step 1 of the public intake form: the reporter types their staff ID, we look
 * it up and show a partially masked name for them to confirm. Only after they
 * confirm does the rest of the form appear — so a case can never be opened
 * against a staff ID nobody eyeballed.
 *
 * The server action re-validates the staff ID on submit; this component is UX,
 * never the security boundary.
 */
import { useState } from "react";
import { BadgeCheck, Loader2, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Found = { employeeCode: string; displayName: string; department: string | null };

export function EmployeeGate({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup() {
    const value = code.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    setFound(null);
    try {
      const res = await fetch("/api/public/employee-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, employeeCode: value }),
      });
      const data = await res.json();
      if (data?.ok) setFound(data as Found);
      else setError(data?.message ?? "ไม่พบรหัสพนักงานนี้ / Staff ID not found");
    } catch {
      setError("เชื่อมต่อไม่ได้ กรุณาลองใหม่ / Network error, please try again");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFound(null);
    setConfirmed(false);
    setError(null);
  }

  // --- Step 1: type the staff ID -------------------------------------------
  if (!confirmed) {
    return (
      <div className="space-y-4">
        <div>
          <Label htmlFor="employeeCode">
            รหัสพนักงาน / Staff ID <span className="text-destructive">*</span>
          </Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="employeeCode"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (found || error) reset();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void lookup();
                }
              }}
              maxLength={64}
              autoComplete="off"
              placeholder="เช่น EMP001"
              disabled={busy}
            />
            <Button type="button" onClick={() => void lookup()} disabled={busy || !code.trim()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span className="ml-2">ตรวจสอบ</span>
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            ใส่รหัสพนักงานเพื่อยืนยันตัวตน ไม่ต้องเข้าสู่ระบบ / Enter your staff ID — no login needed
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {found && (
          <div className="rounded-xl border bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">ใช่คุณหรือไม่? / Is this you?</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
              <BadgeCheck className="h-5 w-5 text-emerald-500" />
              {found.displayName}
            </p>
            <p className="text-sm text-muted-foreground">
              {found.employeeCode}
              {found.department ? ` · ${found.department}` : ""}
            </p>
            <div className="mt-3 flex gap-2">
              <Button type="button" onClick={() => setConfirmed(true)}>
                ใช่ ดำเนินการต่อ / Yes, continue
              </Button>
              <Button type="button" variant="outline" onClick={reset}>
                ไม่ใช่ / Not me
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- Step 2: confirmed, show the case fields ------------------------------
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-emerald-500/5 px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-semibold">
            <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-500" />
            <span className="truncate">{found?.displayName}</span>
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {found?.employeeCode}
            {found?.department ? ` · ${found.department}` : ""}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={reset}>
          <RotateCcw className="mr-1 h-4 w-4" />
          เปลี่ยน
        </Button>
      </div>

      {/* Submitted with the form and re-validated server-side. */}
      <input type="hidden" name="employeeCode" value={found?.employeeCode ?? ""} />

      {children}
    </div>
  );
}
