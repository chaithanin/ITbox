"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

interface Metric {
  metric: string;
  labelTh: string;
  unit: string;
  actual: number;
  target: number;
  gap: number;
  status: "green" | "yellow" | "red";
}
interface Summary {
  eligible: boolean;
  firstName?: string;
  overall?: number;
  overallStatus?: "green" | "yellow" | "red";
  openTickets?: number;
  overdueTickets?: number;
  metrics?: Metric[];
  headline?: string;
  actions?: { level: "green" | "yellow" | "red"; text: string }[];
}

const dot = (s: string) => (s === "green" ? "🟢" : s === "yellow" ? "🟡" : "🔴");
const fmt = (m: Metric) =>
  m.unit === "%" ? `${m.actual}%` : m.unit === "/5" ? `${m.actual}/5` : `${m.actual}${m.unit ? " " + m.unit : ""}`;

/**
 * Post-login KPI popup for IT support agents. mode: DAILY | EVERY_LOGIN | OFF.
 * DAILY dedupes with a localStorage stamp (per browser). Data is fetched only
 * when the popup is actually going to show.
 */
export function KpiPopup({ mode }: { mode: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (mode === "OFF") return;
    const key = "itbox.kpiPopup.lastShown";
    if (mode === "DAILY") {
      try {
        const today = new Date().toISOString().slice(0, 10);
        if (localStorage.getItem(key) === today) return;
      } catch {
        /* storage blocked — fall through and show */
      }
    }
    let cancelled = false;
    fetch("/api/me/kpi-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Summary | null) => {
        if (cancelled || !d || !d.eligible) return;
        setData(d);
        setOpen(true);
        try {
          localStorage.setItem(key, new Date().toISOString().slice(0, 10));
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mode]);

  if (!open || !data) return null;

  const pending = (data.metrics ?? []).filter((m) => m.status !== "green").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border bg-card shadow-xl">
        <div className="flex items-start justify-between border-b bg-primary/5 px-5 py-4">
          <div>
            <p className="text-sm text-muted-foreground">สวัสดี {data.firstName} 👋</p>
            <h2 className="text-lg font-bold">สรุป KPI ของคุณ — เดือนนี้</h2>
          </div>
          <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-accent" aria-label="ปิด">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4">
          <div className="mb-3 flex items-center gap-3">
            <div className="text-3xl font-bold tabular-nums">{data.overall}<span className="text-base text-muted-foreground">/100</span></div>
            <div className="text-sm">
              {dot(data.overallStatus ?? "yellow")}{" "}
              {(data.overall ?? 0) >= 85 ? "Excellent" : (data.overall ?? 0) >= 70 ? "Need Improvement" : "At Risk"}
            </div>
          </div>

          <table className="w-full text-sm">
            <tbody>
              {(data.metrics ?? []).map((m) => (
                <tr key={m.metric} className="border-t">
                  <td className="py-1.5">{m.labelTh}</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(m)} <span className="text-xs text-muted-foreground">/ {m.unit === "%" ? `${m.target}%` : m.target}</span></td>
                  <td className="w-8 py-1.5 text-right">{dot(m.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">
            <p className="font-medium">🎯 สิ่งที่ต้องปรับปรุง ({pending})</p>
            <ul className="mt-1 space-y-1">
              {(data.actions ?? []).slice(0, 4).map((a, i) => (
                <li key={i} className="flex gap-1.5"><span>{dot(a.level)}</span><span>{a.text}</span></li>
              ))}
              {(data.actions ?? []).length === 0 && <li className="text-emerald-600 dark:text-emerald-400">ผ่านครบทุก KPI 🎉</li>}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3">
          <button onClick={() => setOpen(false)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">ปิด</button>
          <Link href="/support/queue" onClick={() => setOpen(false)} className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">ไปจัดการ Ticket</Link>
          <Link href="/support/performance" onClick={() => setOpen(false)} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">ดูรายละเอียด KPI</Link>
        </div>
      </div>
    </div>
  );
}
