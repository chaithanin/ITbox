import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { JOB_LEVELS } from "@/lib/documents/access-profile";

export interface ProfileDefaults {
  name?: string; company?: string | null; department?: string | null; position?: string | null;
  jobLevel?: string | null; isActive?: boolean;
  requiresManagerApproval?: boolean; requiresSystemOwnerApproval?: boolean;
  requiresItManagerApproval?: boolean; requiresManagementApproval?: boolean; notes?: string | null;
}

export function ProfileFields({ d = {}, departments }: { d?: ProfileDefaults; departments: { name: string }[] }) {
  const approvals: { name: keyof ProfileDefaults; th: string }[] = [
    { name: "requiresManagerApproval", th: "ผู้จัดการแผนก / Dept Manager" },
    { name: "requiresSystemOwnerApproval", th: "เจ้าของระบบ / System Owner" },
    { name: "requiresItManagerApproval", th: "IT Manager" },
    { name: "requiresManagementApproval", th: "ฝ่ายบริหาร / Management" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">ชื่อโปรไฟล์ / Profile name *</Label>
          <Input id="name" name="name" required defaultValue={d.name ?? ""} className="mt-1" placeholder="เช่น Online Marketing · Social Media Specialist · L1" />
        </div>
        <div>
          <Label htmlFor="company">บริษัท / Company</Label>
          <Input id="company" name="company" defaultValue={d.company ?? ""} className="mt-1" placeholder="เว้นว่าง = ทุกบริษัท" />
        </div>
        <div>
          <Label htmlFor="department">แผนก / Department</Label>
          <Input id="department" name="department" list="dept-list" defaultValue={d.department ?? ""} className="mt-1" placeholder="เว้นว่าง = ทุกแผนก" />
          <datalist id="dept-list">{departments.map((dep) => <option key={dep.name} value={dep.name} />)}</datalist>
        </div>
        <div>
          <Label htmlFor="position">ตำแหน่ง / Position</Label>
          <Input id="position" name="position" defaultValue={d.position ?? ""} className="mt-1" placeholder="เว้นว่าง = ทุกตำแหน่ง" />
        </div>
        <div>
          <Label htmlFor="jobLevel">ระดับ / Job Level</Label>
          <Select id="jobLevel" name="jobLevel" defaultValue={d.jobLevel ?? ""} className="mt-1">
            <option value="">— ทุกระดับ / Any —</option>
            {JOB_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.th}</option>)}
          </Select>
        </div>
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">สายอนุมัติที่ต้องการ / Required approvals</p>
        <div className="flex flex-wrap gap-4">
          {approvals.map((a) => (
            <label key={a.name} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={a.name} defaultChecked={!!d[a.name]} className="h-4 w-4" /> {a.th}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={d.isActive ?? true} className="h-4 w-4" /> เปิดใช้งาน / Active
        </label>
      </div>

      <div>
        <Label htmlFor="notes">หมายเหตุ / Notes</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={d.notes ?? ""} className="mt-1" />
      </div>
    </div>
  );
}
