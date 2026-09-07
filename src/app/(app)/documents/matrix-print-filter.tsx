"use client";

import { useEffect, useRef } from "react";

/**
 * On print / Save-as-PDF, collapse the ERP permission matrix to show ONLY the
 * rows the user selected — unchecked menu rows, empty group headers and
 * unselected modules are hidden for the printout, then restored afterwards so
 * the on-screen form stays fully editable.
 */
export function MatrixPrintFilter() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const HIDE = "pm-print-hide";

    const apply = () => {
      // 1) Hide data rows with no checked box; keep group headers only when a
      //    visible data row remains under them.
      form.querySelectorAll("tbody").forEach((tb) => {
        let header: Element | null = null;
        let keepHeader = false;
        Array.from(tb.children).forEach((tr) => {
          const boxes = tr.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
          if (boxes.length === 0) {
            if (header && !keepHeader) header.classList.add(HIDE);
            header = tr;
            keepHeader = false;
          } else if (!Array.from(boxes).some((b) => b.checked)) {
            tr.classList.add(HIDE);
          } else {
            keepHeader = true;
          }
        });
        if (header && !keepHeader) (header as Element).classList.add(HIDE);
      });

      // 2) Hide a whole module/section when neither its access toggle nor any
      //    of its menu rows are selected.
      form.querySelectorAll("details").forEach((d) => {
        const toggle = d.querySelector<HTMLInputElement>('input[name^="module:"]');
        const anyRow = Array.from(d.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
          .some((b) => b.checked && !/^module:/.test(b.name));
        if (!(toggle?.checked) && !anyRow) d.classList.add(HIDE);
      });
    };

    const restore = () => form.querySelectorAll("." + HIDE).forEach((el) => el.classList.remove(HIDE));

    window.addEventListener("beforeprint", apply);
    window.addEventListener("afterprint", restore);
    // Safari uses matchMedia change instead of before/afterprint.
    const mql = window.matchMedia("print");
    const onChange = (e: MediaQueryListEvent) => (e.matches ? apply() : restore());
    mql.addEventListener?.("change", onChange);

    return () => {
      window.removeEventListener("beforeprint", apply);
      window.removeEventListener("afterprint", restore);
      mql.removeEventListener?.("change", onChange);
    };
  }, []);

  return <span ref={ref} hidden />;
}
