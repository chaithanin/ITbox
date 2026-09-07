"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";

type Flag = "enabled" | "notPrintable" | "readOnly" | "notSaveAs";

/**
 * Quick default-value setter for the ERP per-menu permission matrix. Operates
 * on the surrounding <form>'s native checkboxes by name pattern, so it needs no
 * shared state with the (server-rendered) matrix. Purely a convenience for
 * filling the document faster; nothing is submitted until the user does so.
 */
export function MatrixPresets() {
  const ref = useRef<HTMLDivElement>(null);

  function form(): HTMLFormElement | null {
    return ref.current?.closest("form") ?? null;
  }
  function eachErp(cb: (el: HTMLInputElement, flag: Flag) => void) {
    const f = form();
    if (!f) return;
    f.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((el) => {
      const m = /^erp:[^:]+:\d+:(enabled|notPrintable|readOnly|notSaveAs)$/.exec(el.name);
      if (m) cb(el, m[1] as Flag);
    });
  }
  function eachModule(cb: (el: HTMLInputElement) => void) {
    const f = form();
    if (!f) return;
    f.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((el) => {
      if (/^module:/.test(el.name)) cb(el);
    });
  }

  // Presets set default values on every menu row across all ERP modules.
  const enableAll = () => { eachModule((el) => (el.checked = true)); eachErp((el, flag) => { el.checked = flag === "enabled"; }); };
  const readOnlyAll = () => { eachModule((el) => (el.checked = true)); eachErp((el, flag) => { el.checked = flag === "enabled" || flag === "readOnly"; }); };
  const noPrintAll = () => eachErp((el, flag) => { if (flag === "notPrintable") el.checked = true; });
  const noSaveAll = () => eachErp((el, flag) => { if (flag === "notSaveAs") el.checked = true; });
  const clearAll = () => { eachModule((el) => (el.checked = false)); eachErp((el) => (el.checked = false)); };

  return (
    <div ref={ref} className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-3 no-print">
      <span className="text-xs font-medium text-muted-foreground">ตั้งค่าเริ่มต้นรายเมนู (ERP):</span>
      <Button type="button" size="sm" variant="outline" onClick={enableAll}>เปิดใช้งานทั้งหมด / Enable all</Button>
      <Button type="button" size="sm" variant="outline" onClick={readOnlyAll}>ดูอย่างเดียวทั้งหมด / Read-only all</Button>
      <Button type="button" size="sm" variant="outline" onClick={noPrintAll}>ห้ามพิมพ์ทั้งหมด / Not printable</Button>
      <Button type="button" size="sm" variant="outline" onClick={noSaveAll}>ห้ามบันทึกไฟล์ทั้งหมด / Not save as</Button>
      <Button type="button" size="sm" variant="ghost" onClick={clearAll}>ล้างทั้งหมด / Clear</Button>
    </div>
  );
}
