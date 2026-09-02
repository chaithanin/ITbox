"use client";

import { useMemo, useState } from "react";
import { Search, X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createBorrowAction } from "./actions";

export interface EmployeeOption {
  id: string;
  code: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  departmentName: string | null;
}
export interface AssetOption {
  id: string;
  assetTag: string;
  name: string;
  serialNumber: string | null;
  categoryName: string | null;
}

export function BorrowRequestForm({
  employees,
  assets,
  defaultRequesterId,
  defaultAssets,
  canPickRequester,
}: {
  employees: EmployeeOption[];
  assets: AssetOption[];
  defaultRequesterId?: string;
  defaultAssets?: AssetOption[];
  canPickRequester: boolean;
}) {
  const [requesterId, setRequesterId] = useState(defaultRequesterId ?? "");
  const [empQuery, setEmpQuery] = useState("");
  const [assetQuery, setAssetQuery] = useState("");
  const [selected, setSelected] = useState<AssetOption[]>(defaultAssets ?? []);

  const requester = employees.find((e) => e.id === requesterId) ?? null;

  const empMatches = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    if (!q) return [];
    return employees
      .filter((e) => `${e.code} ${e.name} ${e.position ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [empQuery, employees]);

  const assetMatches = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(selected.map((s) => s.id));
    return assets
      .filter((a) => !chosen.has(a.id))
      .filter((a) =>
        `${a.assetTag} ${a.name} ${a.serialNumber ?? ""} ${a.categoryName ?? ""}`.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [assetQuery, assets, selected]);

  const addAsset = (a: AssetOption) => {
    setSelected((s) => [...s, a]);
    setAssetQuery("");
  };
  const removeAsset = (id: string) => setSelected((s) => s.filter((a) => a.id !== id));

  const ready = requesterId && selected.length > 0;

  return (
    <form action={createBorrowAction} className="space-y-6">
      <input type="hidden" name="requesterEmployeeId" value={requesterId} />
      {selected.map((a) => (
        <input key={a.id} type="hidden" name="assetId" value={a.id} />
      ))}

      {/* Requester */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">ผู้ขอยืม / Requester</h2>
          {canPickRequester ? (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={empQuery}
                  onChange={(e) => setEmpQuery(e.target.value)}
                  placeholder="ค้นหารหัส/ชื่อพนักงาน / Search employee code or name"
                  className="pl-9"
                />
              </div>
              {empMatches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-md">
                  {empMatches.map((e) => (
                    <button
                      type="button"
                      key={e.id}
                      onClick={() => { setRequesterId(e.id); setEmpQuery(""); }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span>{e.name} <span className="text-muted-foreground">({e.code})</span></span>
                      <span className="text-xs text-muted-foreground">{e.departmentName ?? ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {requester ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md bg-muted/40 p-3 text-sm md:grid-cols-4">
              <Field label="ชื่อ / Name" value={requester.name} />
              <Field label="รหัส / Code" value={requester.code} />
              <Field label="ตำแหน่ง / Position" value={requester.position ?? "—"} />
              <Field label="แผนก / Dept" value={requester.departmentName ?? "—"} />
              <Field label="โทร / Phone" value={requester.phone ?? "—"} />
              <Field label="อีเมล / Email" value={requester.email ?? "—"} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">ยังไม่ได้เลือกผู้ขอ / No requester selected.</p>
          )}
        </CardContent>
      </Card>

      {/* Assets */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h2 className="text-sm font-semibold">ทรัพย์สินที่ขอยืม / Assets to borrow</h2>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={assetQuery}
                onChange={(e) => setAssetQuery(e.target.value)}
                placeholder="ค้นหารหัส/ชื่อ/Serial ทรัพย์สินที่ว่าง / Search available assets"
                className="pl-9"
              />
            </div>
            {assetMatches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-card shadow-md">
                {assetMatches.map((a) => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => addAsset(a)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span>{a.assetTag} · {a.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {a.serialNumber ? `S/N ${a.serialNumber}` : a.categoryName ?? ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {assets.length === 0 && (
            <p className="text-sm text-amber-600">ไม่มีทรัพย์สินที่ว่างให้ยืม / No available assets to borrow.</p>
          )}

          {selected.length > 0 ? (
            <ul className="divide-y rounded-md border">
              {selected.map((a) => (
                <li key={a.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{a.assetTag}</span> · {a.name}
                    {a.serialNumber && <span className="text-muted-foreground"> · S/N {a.serialNumber}</span>}
                  </span>
                  <button type="button" onClick={() => removeAsset(a.id)} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">ยังไม่ได้เลือกทรัพย์สิน / No assets selected yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Details */}
      <Card>
        <CardContent className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="borrowDate">วันที่ยืม / Borrow date</Label>
            <Input id="borrowDate" name="borrowDate" type="date" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dueDate">กำหนดคืน / Due date</Label>
            <Input id="dueDate" name="dueDate" type="date" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="useLocation">สถานที่ใช้งาน / Location of use</Label>
            <Input id="useLocation" name="useLocation" placeholder="เช่น สาขา / ไซต์งาน / ห้องประชุม" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="purpose">วัตถุประสงค์ / Purpose</Label>
            <Textarea id="purpose" name="purpose" rows={2} placeholder="เหตุผลในการขอยืม" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="notes">หมายเหตุ / Notes</Label>
            <Textarea id="notes" name="notes" rows={2} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit" name="submit" value="false" variant="outline" disabled={!ready}>
          บันทึกร่าง / Save draft
        </Button>
        <Button type="submit" name="submit" value="true" disabled={!ready}>
          <Plus className="mr-1 h-4 w-4" /> ส่งขออนุมัติ / Submit for approval
        </Button>
      </div>
    </form>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
