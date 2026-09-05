"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Staff-ID input for the document forms. On blur / Enter it looks the code up
 * and fills the sibling fields in the same <form> (name, department, position,
 * phone, email) when they exist and are still empty.
 */
export function StaffIdField({ name, label }: { name: string; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "notfound">("idle");

  function setIfEmpty(form: HTMLFormElement, field: string, value: string | null) {
    if (!value) return;
    const el = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${field}"]`);
    if (el && !el.value.trim()) el.value = value;
  }

  async function lookup() {
    const code = ref.current?.value.trim();
    const form = ref.current?.form;
    if (!code || !form) return;
    setStatus("loading");
    try {
      const res = await fetch(`/api/doc-forms/lookup?code=${encodeURIComponent(code)}`);
      const data = (await res.json()) as {
        found: boolean; name?: string; department?: string | null;
        position?: string | null; phone?: string | null; email?: string | null;
      };
      if (!data.found) { setStatus("notfound"); return; }
      // Fill both TH/EN name fields (the directory keeps a single name).
      setIfEmpty(form, "nameTh", data.name ?? null);
      setIfEmpty(form, "nameEn", data.name ?? null);
      setIfEmpty(form, "department2", data.department ?? null);
      setIfEmpty(form, "position", data.position ?? null);
      setIfEmpty(form, "phone", data.phone ?? null);
      setIfEmpty(form, "email", data.email ?? null);
      setStatus("found");
    } catch {
      setStatus("idle");
    }
  }

  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <div className="relative mt-1">
        <Input
          ref={ref}
          id={name}
          name={name}
          placeholder="กรอกรหัสพนักงานแล้วกด Enter เพื่อดึงข้อมูล"
          onBlur={lookup}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); lookup(); }
          }}
        />
        {status === "loading" && (
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {status === "found" && <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">พบข้อมูล — กรอกให้อัตโนมัติแล้ว / Auto-filled</p>}
      {status === "notfound" && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">ไม่พบรหัสพนักงานนี้ / Staff ID not found — กรอกเองได้</p>}
    </div>
  );
}
