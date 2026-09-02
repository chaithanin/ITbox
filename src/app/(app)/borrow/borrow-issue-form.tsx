"use client";

import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { issueAction } from "./actions";

const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "DAMAGED", "OTHER"] as const;

export interface IssueItemRow {
  borrowItemId: string;
  assetTag: string;
  name: string;
  serialNumber: string | null;
}

export function BorrowIssueForm({ requestId, items }: { requestId: string; items: IssueItemRow[] }) {
  const [rows, setRows] = useState(
    items.map((i) => ({ ...i, conditionBefore: "GOOD" as (typeof CONDITIONS)[number], conditionNote: "" }))
  );

  const setRow = (id: string, patch: Partial<(typeof rows)[number]>) =>
    setRows((rs) => rs.map((r) => (r.borrowItemId === id ? { ...r, ...patch } : r)));

  const payload = JSON.stringify(
    rows.map((r) => ({ borrowItemId: r.borrowItemId, conditionBefore: r.conditionBefore, conditionNote: r.conditionNote || null }))
  );

  return (
    <form action={issueAction} className="space-y-4">
      <input type="hidden" name="id" value={requestId} />
      <input type="hidden" name="items" value={payload} />

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.borrowItemId} className="rounded-md border p-3">
            <div className="mb-2 text-sm font-medium">
              {r.assetTag} · {r.name}
              {r.serialNumber && <span className="text-muted-foreground"> · S/N {r.serialNumber}</span>}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>สภาพก่อนจ่าย / Condition before</Label>
                <Select
                  value={r.conditionBefore}
                  onChange={(e) => setRow(r.borrowItemId, { conditionBefore: e.target.value as (typeof CONDITIONS)[number] })}
                >
                  {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div className="space-y-1">
                <Label>หมายเหตุ / Note</Label>
                <Input value={r.conditionNote} onChange={(e) => setRow(r.borrowItemId, { conditionNote: e.target.value })} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="receivedByName">ผู้รับมอบ / Received by</Label>
          <Input id="receivedByName" name="receivedByName" placeholder="ชื่อผู้รับอุปกรณ์" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="note">หมายเหตุการจ่าย / Handover note</Label>
          <Input id="note" name="note" />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit">
          <PackageCheck className="mr-1 h-4 w-4" /> ยืนยันการจ่าย / Confirm Issue
        </Button>
      </div>
    </form>
  );
}
