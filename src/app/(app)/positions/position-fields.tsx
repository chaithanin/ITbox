import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const LEVELS: { value: string; label: string }[] = [
  { value: "", label: "— ไม่ระบุ / None —" },
  { value: "L0", label: "L0 · Outsource / Temporary" },
  { value: "L1", label: "L1 · Staff / Officer" },
  { value: "L2", label: "L2 · Senior / Executive" },
  { value: "L3", label: "L3 · Supervisor" },
  { value: "L4", label: "L4 · Assistant Manager" },
  { value: "L5", label: "L5 · Manager / Dept Head" },
  { value: "L6", label: "L6 · Director / C-Level" },
  { value: "IT_ADMIN", label: "IT_ADMIN · System Administrator" },
];

export interface PositionDefaults {
  name?: string; code?: string | null; departmentId?: string | null; jobLevel?: string | null; isActive?: boolean;
}

export function PositionFields({ d = {}, departments }: { d?: PositionDefaults; departments: { id: string; name: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="name">ชื่อตำแหน่ง / Position Name *</Label>
        <Input id="name" name="name" required defaultValue={d.name ?? ""} className="mt-1" placeholder="เช่น Social Media Specialist" />
      </div>
      <div>
        <Label htmlFor="code">รหัส / Code</Label>
        <Input id="code" name="code" defaultValue={d.code ?? ""} className="mt-1" placeholder="เช่น MKT-SOCIAL" />
      </div>
      <div>
        <Label htmlFor="departmentId">แผนก / Department</Label>
        <Select id="departmentId" name="departmentId" defaultValue={d.departmentId ?? ""} className="mt-1">
          <option value="">— ไม่ระบุ / None —</option>
          {departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="jobLevel">ระดับ / Job Level</Label>
        <Select id="jobLevel" name="jobLevel" defaultValue={d.jobLevel ?? ""} className="mt-1">
          {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </Select>
      </div>
      <div className="sm:col-span-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={d.isActive ?? true} className="h-4 w-4" /> เปิดใช้งาน / Active
        </label>
      </div>
    </div>
  );
}
