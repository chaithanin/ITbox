"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

export interface SystemDef { key: string; label: string; levels: string[]; resources: string[] }
export interface ProfileItem { system: string; resource: string | null; permissionLevel: string; defaultStatus: string; requiresApproval: boolean }

const STATUSES = [
  { value: "REQUIRED", th: "REQUIRED · ให้อัตโนมัติ" },
  { value: "OPTIONAL", th: "OPTIONAL · ขอเพิ่มได้" },
  { value: "RESTRICTED", th: "RESTRICTED · ต้องอนุมัติเพิ่ม" },
  { value: "NOT_ALLOWED", th: "NOT_ALLOWED · ห้าม" },
];

export function ProfileItemsEditor({ systems, initial }: { systems: SystemDef[]; initial: ProfileItem[] }) {
  const [rows, setRows] = useState<ProfileItem[]>(initial.length ? initial : []);
  const sysMap = useMemo(() => new Map(systems.map((s) => [s.key, s])), [systems]);

  const update = (i: number, patch: Partial<ProfileItem>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const add = () => setRows((r) => [...r, { system: systems[0]?.key ?? "", resource: null, permissionLevel: systems[0]?.levels[0] ?? "Admin", defaultStatus: "REQUIRED", requiresApproval: false }]);
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <input type="hidden" name="itemsJson" value={JSON.stringify(rows)} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 text-left text-xs">
              <th className="border px-2 py-1">ระบบ / System</th>
              <th className="border px-2 py-1">รายการย่อย / Resource</th>
              <th className="border px-2 py-1">ระดับ / Level</th>
              <th className="border px-2 py-1">สถานะ / Status</th>
              <th className="border px-2 py-1">อนุมัติ?</th>
              <th className="border px-2 py-1"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="border px-2 py-4 text-center text-muted-foreground">ยังไม่มีรายการ — กด &quot;เพิ่มสิทธิ์&quot;</td></tr>
            )}
            {rows.map((row, i) => {
              const sys = sysMap.get(row.system);
              return (
                <tr key={i}>
                  <td className="border p-0">
                    <Select value={row.system} onChange={(e) => { const s = sysMap.get(e.target.value); update(i, { system: e.target.value, permissionLevel: s?.levels[0] ?? row.permissionLevel, resource: null }); }} className="h-8 w-full border-0">
                      {systems.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </Select>
                  </td>
                  <td className="border p-0">
                    <Select value={row.resource ?? ""} onChange={(e) => update(i, { resource: e.target.value || null })} className="h-8 w-full border-0">
                      <option value="">— ทั้งระบบ / All —</option>
                      {(sys?.resources ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
                    </Select>
                  </td>
                  <td className="border p-0">
                    <Select value={row.permissionLevel} onChange={(e) => update(i, { permissionLevel: e.target.value })} className="h-8 w-full border-0">
                      {(sys?.levels ?? ["Admin", "Editor", "Viewer"]).map((l) => <option key={l} value={l}>{l}</option>)}
                    </Select>
                  </td>
                  <td className="border p-0">
                    <Select value={row.defaultStatus} onChange={(e) => update(i, { defaultStatus: e.target.value })} className="h-8 w-full border-0">
                      {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.th}</option>)}
                    </Select>
                  </td>
                  <td className="border px-2 text-center">
                    <input type="checkbox" checked={row.requiresApproval} onChange={(e) => update(i, { requiresApproval: e.target.checked })} className="h-4 w-4" />
                  </td>
                  <td className="border px-1 text-center">
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={add}><Plus className="h-4 w-4" /> เพิ่มสิทธิ์ / Add permission</Button>
    </div>
  );
}
