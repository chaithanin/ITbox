"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Staff ID + Name inputs for the "Create User" form. When the admin enters a
 * Staff ID that matches an employee, the name auto-fills from that record
 * (admin-only lookup). A name the admin typed by hand is never overwritten.
 */
export function CreateUserFields() {
  const [name, setName] = useState("");
  const [hint, setHint] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const autoFilled = useRef(false);

  const lookup = async (raw: string) => {
    const code = raw.trim();
    if (!code) {
      setHint(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/employees/lookup?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if (data.found) {
        const dept = data.department ? ` · ${data.department}` : "";
        const linked = data.linked ? " (มีบัญชีอยู่แล้ว)" : "";
        setHint({ text: `พบพนักงาน: ${data.name}${dept}${linked}`, ok: true });
        // Fill the name only if it is empty or was itself auto-filled before.
        if (!name.trim() || autoFilled.current) {
          setName(data.name);
          autoFilled.current = true;
        }
      } else {
        setHint({ text: "ไม่พบพนักงานตามรหัสนี้ / No matching employee", ok: false });
      }
    } catch {
      setHint(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="employeeCode">รหัสพนักงาน / Staff ID</Label>
        <Input
          id="employeeCode"
          name="employeeCode"
          maxLength={50}
          placeholder="เช่น EMP001 (ไม่บังคับ)"
          onBlur={(e) => lookup(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              lookup((e.target as HTMLInputElement).value);
            }
          }}
        />
        {(hint || loading) && (
          <p className={`text-[11px] ${loading ? "text-muted-foreground" : hint?.ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {loading ? "กำลังค้นหา…" : hint?.text}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor="name">ชื่อ / Name</Label>
        <Input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            autoFilled.current = false;
          }}
        />
      </div>
    </>
  );
}
