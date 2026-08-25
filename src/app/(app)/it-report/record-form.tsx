import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CATEGORY_META, CATEGORY_ORDER } from "@/lib/services/it-report";
import { recordCheckAction } from "./actions";

const STATUSES: { value: string; label: string }[] = [
  { value: "NORMAL", label: "🟢 Normal / ปกติ" },
  { value: "WARNING", label: "🟡 Warning / เฝ้าระวัง" },
  { value: "CRITICAL", label: "🔴 Critical / วิกฤต" },
  { value: "NOT_CHECKED", label: "⚪ Not checked / ยังไม่ตรวจ" },
];
const MODES: { value: string; label: string }[] = [
  { value: "AUTO", label: "🟢 Auto (ดึงอัตโนมัติ)" },
  { value: "CHECK_REQUIRED", label: "🟡 Check Required (ต้องตรวจ)" },
  { value: "ISSUE", label: "🔴 Issue (พบปัญหา)" },
];

/** Add or update today's check for a system item (upsert by category + name). */
export function RecordCheckForm() {
  return (
    <form action={recordCheckAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="lg:col-span-1">
        <Label htmlFor="category">หมวด / Category</Label>
        <Select id="category" name="category" required defaultValue="SERVER" className="mt-1">
          {CATEGORY_ORDER.map((c) => (
            <option key={c} value={c}>{CATEGORY_META[c].en}</option>
          ))}
        </Select>
      </div>
      <div className="lg:col-span-2">
        <Label htmlFor="name">ชื่อรายการ / Item name *</Label>
        <Input id="name" name="name" required maxLength={200} className="mt-1" placeholder="เช่น Monday Server / Paradise DVR1" />
      </div>
      <div className="lg:col-span-1">
        <Label htmlFor="status">สถานะ / Status</Label>
        <Select id="status" name="status" required defaultValue="NORMAL" className="mt-1">
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>
      <div className="lg:col-span-1">
        <Label htmlFor="mode">แหล่งข้อมูล / Mode</Label>
        <Select id="mode" name="mode" required defaultValue="CHECK_REQUIRED" className="mt-1">
          {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </Select>
      </div>
      <div className="lg:col-span-1">
        <Label htmlFor="healthPercent">Health %</Label>
        <Input id="healthPercent" name="healthPercent" type="number" min={0} max={100} className="mt-1" placeholder="เช่น 72" />
      </div>
      <div className="sm:col-span-2 lg:col-span-5">
        <Label htmlFor="note">หมายเหตุ / Note</Label>
        <Input id="note" name="note" maxLength={2000} className="mt-1" placeholder="เช่น Recording missing, Storage 88%, Camera offline" />
      </div>
      <div className="flex items-end lg:col-span-1">
        <Button type="submit" className="w-full">บันทึก / Save</Button>
      </div>
    </form>
  );
}
