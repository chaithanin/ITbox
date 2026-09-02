"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { returnAction } from "./actions";

const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "DAMAGED", "OTHER"] as const;
const RESULTS = ["COMPLETE", "MISSING_ACCESSORY", "REPAIR_REQUIRED", "DAMAGED", "LOST"] as const;

export interface ReturnItemRow {
  borrowItemId: string;
  assetTag: string;
  name: string;
}

export function BorrowReturnForm({ requestId, items }: { requestId: string; items: ReturnItemRow[] }) {
  const [rows, setRows] = useState(
    items.map((i) => ({
      ...i,
      include: true,
      conditionAfter: "GOOD" as (typeof CONDITIONS)[number],
      inspectionResult: "COMPLETE" as (typeof RESULTS)[number],
      accessoriesComplete: true,
      accessoriesNote: "",
      damageNote: "",
    }))
  );

  const setRow = (id: string, patch: Partial<(typeof rows)[number]>) =>
    setRows((rs) => rs.map((r) => (r.borrowItemId === id ? { ...r, ...patch } : r)));

  const chosen = rows.filter((r) => r.include);
  const payload = JSON.stringify(
    chosen.map((r) => ({
      borrowItemId: r.borrowItemId,
      conditionAfter: r.conditionAfter,
      inspectionResult: r.inspectionResult,
      accessoriesComplete: r.accessoriesComplete,
      accessoriesNote: r.accessoriesNote || null,
      damageNote: r.damageNote || null,
    }))
  );

  return (
    <form action={returnAction} className="space-y-4">
      <input type="hidden" name="id" value={requestId} />
      <input type="hidden" name="items" value={payload} />

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.borrowItemId} className={`rounded-md border p-3 ${r.include ? "" : "opacity-50"}`}>
            <label className="mb-2 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={r.include}
                onChange={(e) => setRow(r.borrowItemId, { include: e.target.checked })}
              />
              {r.assetTag} · {r.name}
            </label>
            {r.include && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>สภาพหลังคืน / Condition after</Label>
                  <Select
                    value={r.conditionAfter}
                    onChange={(e) => setRow(r.borrowItemId, { conditionAfter: e.target.value as (typeof CONDITIONS)[number] })}
                  >
                    {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>ผลการตรวจ / Inspection result</Label>
                  <Select
                    value={r.inspectionResult}
                    onChange={(e) => setRow(r.borrowItemId, { inspectionResult: e.target.value as (typeof RESULTS)[number] })}
                  >
                    {RESULTS.map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={r.accessoriesComplete}
                    onChange={(e) => setRow(r.borrowItemId, { accessoriesComplete: e.target.checked })}
                  />
                  อุปกรณ์เสริมครบ / Accessories complete
                </label>
                <div className="space-y-1">
                  <Label>หมายเหตุความเสียหาย / Damage note</Label>
                  <Input value={r.damageNote} onChange={(e) => setRow(r.borrowItemId, { damageNote: e.target.value })} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="returnedByName">ผู้ส่งคืน / Returned by</Label>
          <Input id="returnedByName" name="returnedByName" placeholder="ชื่อผู้ส่งคืน" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="note">หมายเหตุการรับคืน / Return note</Label>
          <Input id="note" name="note" />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">เลือกคืน {chosen.length} รายการ / {chosen.length} item(s) selected</p>
        <Button type="submit" disabled={chosen.length === 0}>
          <Undo2 className="mr-1 h-4 w-4" /> บันทึกการคืน / Record Return
        </Button>
      </div>
    </form>
  );
}
