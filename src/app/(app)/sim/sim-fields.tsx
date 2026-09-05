import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const STATUSES = ["ACTIVE", "UNUSED", "SUSPENDED", "TERMINATED"] as const;
const CARRIERS = ["AIS", "DTAC", "TRUE", "NT", "OTHER"];

export interface SimDefaults {
  phoneNumber?: string; carrier?: string; accountName?: string | null; holder?: string | null;
  employeeId?: string | null; departmentId?: string | null; status?: string;
  simSerial?: string | null; plan?: string | null; monthlyFee?: string | null;
  startDate?: string | null; notes?: string | null;
}

export function SimFields({
  d = {}, employees, departments,
}: {
  d?: SimDefaults;
  employees: { id: string; firstName: string; lastName: string; employeeCode: string }[];
  departments: { id: string; name: string }[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label htmlFor="phoneNumber">เบอร์โทร / Phone Number *</Label>
        <Input id="phoneNumber" name="phoneNumber" required defaultValue={d.phoneNumber ?? ""} className="mt-1" placeholder="08x-xxx-xxxx" />
      </div>
      <div>
        <Label htmlFor="carrier">ค่าย / Carrier *</Label>
        <Input id="carrier" name="carrier" required list="carrier-list" defaultValue={d.carrier ?? ""} className="mt-1" placeholder="AIS / DTAC / TRUE" />
        <datalist id="carrier-list">{CARRIERS.map((c) => <option key={c} value={c} />)}</datalist>
      </div>
      <div>
        <Label htmlFor="accountName">บัญชี/กลุ่ม / Account</Label>
        <Input id="accountName" name="accountName" defaultValue={d.accountName ?? ""} className="mt-1" placeholder="เช่น GTG, Heliton" />
      </div>
      <div>
        <Label htmlFor="status">สถานะ / Status</Label>
        <Select id="status" name="status" defaultValue={d.status ?? "ACTIVE"} className="mt-1">
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="holder">ผู้ถือครอง (ข้อความ) / Holder</Label>
        <Input id="holder" name="holder" defaultValue={d.holder ?? ""} className="mt-1" placeholder="ชื่อ/วัตถุประสงค์ เช่น K.Ann-Acc, EDC" />
      </div>
      <div>
        <Label htmlFor="employeeId">ผูกกับพนักงาน / Employee (optional)</Label>
        <Select id="employeeId" name="employeeId" defaultValue={d.employeeId ?? ""} className="mt-1">
          <option value="">— ไม่ผูก / None —</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="departmentId">แผนก / Department</Label>
        <Select id="departmentId" name="departmentId" defaultValue={d.departmentId ?? ""} className="mt-1">
          <option value="">— ไม่ระบุ / None —</option>
          {departments.map((dep) => <option key={dep.id} value={dep.id}>{dep.name}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="simSerial">หมายเลขซิม / SIM Serial</Label>
        <Input id="simSerial" name="simSerial" defaultValue={d.simSerial ?? ""} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="plan">แพ็กเกจ / Plan</Label>
        <Input id="plan" name="plan" defaultValue={d.plan ?? ""} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="monthlyFee">ค่าบริการ/เดือน / Monthly Fee</Label>
        <Input id="monthlyFee" name="monthlyFee" type="number" step="0.01" defaultValue={d.monthlyFee ?? ""} className="mt-1" />
      </div>
      <div>
        <Label htmlFor="startDate">วันที่เริ่ม / Start Date</Label>
        <Input id="startDate" name="startDate" type="date" defaultValue={d.startDate ?? ""} className="mt-1" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="notes">หมายเหตุ / Notes</Label>
        <Textarea id="notes" name="notes" rows={2} defaultValue={d.notes ?? ""} className="mt-1" />
      </div>
    </div>
  );
}
