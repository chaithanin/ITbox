"use client";

import { useState } from "react";
import { CheckCircle2, Circle, ChevronRight, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { recordCheckAction } from "./actions";

export type ChecklistCheck = {
  id: string;
  name: string;
  status: string;
  note: string | null;
  healthPercent: number | null;
  mode: string;
};

export type ChecklistRow = {
  key: string;
  label: string;
  done: boolean;
  auto: boolean;
  hasData: boolean;
  checks: ChecklistCheck[];
};

const STATUS_DOT: Record<string, string> = {
  NORMAL: "bg-emerald-500",
  WARNING: "bg-amber-500",
  CRITICAL: "bg-red-500",
  NOT_CHECKED: "bg-muted-foreground/40",
};

const STATUS_OPTS = [
  { value: "NORMAL", label: "🟢 ปกติ" },
  { value: "WARNING", label: "🟡 เฝ้าระวัง" },
  { value: "CRITICAL", label: "🔴 วิกฤต" },
];

/**
 * Daily IT Checklist — each line is clickable to expand: it shows the items
 * already recorded today in that category and an inline form to add a detail
 * (name · status · note · health%). Submitting upserts today's check via the
 * shared recordCheckAction server action.
 */
export function ChecklistPanel({ rows, canRecord }: { rows: ChecklistRow[]; canRecord: boolean }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      {rows.map((item) => {
        const isOpen = open === item.key;
        return (
          <div key={item.key} className="rounded-md">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : item.key)}
              className="flex w-full items-center gap-2.5 rounded-md px-1 py-1.5 text-left text-sm hover:bg-muted/60"
            >
              <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
              {item.done ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className={`flex-1 ${item.done ? "" : "text-muted-foreground"}`}>{item.label}</span>
              {item.checks.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">{item.checks.length}</span>
              )}
              {item.auto && <span className="text-[10px] font-medium text-emerald-600">✓ Auto</span>}
              {!item.hasData && <span className="text-[10px] text-muted-foreground">รอตรวจ</span>}
            </button>

            {isOpen && (
              <div className="ml-6 mb-1 space-y-2 border-l pl-3">
                {item.checks.length > 0 ? (
                  <ul className="space-y-1 pt-1">
                    {item.checks.map((c) => (
                      <li key={c.id} className="flex items-start gap-2 text-xs">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[c.status] ?? "bg-muted-foreground/40"}`} />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{c.name}</span>
                          {c.healthPercent != null && <span className="ml-1 text-muted-foreground">· {c.healthPercent}%</span>}
                          {c.note && <span className="block text-muted-foreground">{c.note}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="pt-1 text-xs text-muted-foreground">ยังไม่มีรายละเอียดในหมวดนี้วันนี้</p>
                )}

                {canRecord && (
                  <form action={recordCheckAction} className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-12">
                    <input type="hidden" name="category" value={item.key} />
                    <input type="hidden" name="mode" value="CHECK_REQUIRED" />
                    <Input
                      name="name"
                      required
                      maxLength={200}
                      placeholder="ชื่อรายการ เช่น Paradise DVR1"
                      className="col-span-2 h-8 text-xs sm:col-span-5"
                    />
                    <Select name="status" required defaultValue="NORMAL" className="h-8 text-xs sm:col-span-3">
                      {STATUS_OPTS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </Select>
                    <Input
                      name="note"
                      maxLength={2000}
                      placeholder="หมายเหตุ / รายละเอียด"
                      className="col-span-2 h-8 text-xs sm:col-span-8"
                    />
                    <Input
                      name="healthPercent"
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Health %"
                      className="h-8 text-xs sm:col-span-2"
                    />
                    <Button type="submit" size="sm" className="col-span-2 h-8 text-xs sm:col-span-2">
                      <Plus className="h-3.5 w-3.5" /> เพิ่ม
                    </Button>
                  </form>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
