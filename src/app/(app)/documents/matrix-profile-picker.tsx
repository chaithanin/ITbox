"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MATRIX_PROFILES, PROFILE_DEFAULT_SELECTIONS } from "@/lib/documents/matrix-default-profiles";

/**
 * Recommended default-profile picker for the access-request matrix. Choosing a
 * profile (from the company RBAC baseline, GTG_Permission_Matrix_Recommended)
 * clears the matrix and ticks exactly the recommended checkboxes for that job
 * function. Operates on the surrounding <form>'s native checkboxes by name — no
 * shared state with the server-rendered matrix. Document default only; grants
 * no real access. The user can still adjust any box before submitting.
 */
const MATRIX_NAME_RE = /^(erp:|module:|mkt:|sales:|rental:)/;

export function MatrixProfilePicker() {
  const ref = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<string | null>(null);

  function form(): HTMLFormElement | null {
    return ref.current?.closest("form") ?? null;
  }

  function apply() {
    const f = form();
    if (!f || !code) return;
    const want = new Set(PROFILE_DEFAULT_SELECTIONS[code] ?? []);
    // Clear every matrix checkbox, then tick exactly the profile's recommended set.
    f.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((el) => {
      if (MATRIX_NAME_RE.test(el.name)) el.checked = want.has(el.name);
    });
    const prof = MATRIX_PROFILES.find((p) => p.code === code);
    setApplied(prof ? `${prof.name} (${want.size} รายการ)` : `${want.size} รายการ`);
  }

  // Group profiles by department for a tidy dropdown.
  const groups = new Map<string, typeof MATRIX_PROFILES>();
  for (const p of MATRIX_PROFILES) (groups.get(p.department) ?? groups.set(p.department, []).get(p.department)!).push(p);

  return (
    <div ref={ref} className="mb-3 rounded-lg border bg-primary/5 p-3 no-print">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">โปรไฟล์เริ่มต้นแนะนำ (RBAC) / Recommended default profile:</span>
        <select
          value={code}
          onChange={(e) => { setCode(e.target.value); setApplied(null); }}
          className="rounded-md border bg-background px-2 py-1.5 text-sm"
        >
          <option value="">— เลือกตำแหน่ง/หน้าที่ / Select role —</option>
          {[...groups.entries()].map(([dept, list]) => (
            <optgroup key={dept} label={dept}>
              {list.map((p) => <option key={p.code} value={p.code}>{p.name} · {p.code}</option>)}
            </optgroup>
          ))}
        </select>
        <Button type="button" size="sm" onClick={apply} disabled={!code}>ใช้ค่าเริ่มต้นนี้ / Apply</Button>
        {applied && <span className="text-xs text-emerald-600 dark:text-emerald-400">✓ ตั้งค่าตามโปรไฟล์: {applied} — ปรับแก้เพิ่มได้</span>}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        อ้างอิงมาตรฐานสิทธิ์ตามหน้าที่ (least privilege / segregation of duties) — เป็นค่าเริ่มต้นสำหรับ “เอกสารคำขอสิทธิ์” เท่านั้น ไม่ได้ให้สิทธิ์ระบบจริง
      </p>
    </div>
  );
}
