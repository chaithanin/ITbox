import type { Asset } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export const ASSET_CONDITIONS = ["NEW", "GOOD", "FAIR", "DAMAGED", "CRITICAL"] as const;

export const ASSET_STATUSES = [
  "AVAILABLE",
  "ASSIGNED",
  "IN_USE",
  "IN_REPAIR",
  "LOST",
  "STOLEN",
  "DAMAGED",
  "RETIRED",
  "DISPOSED",
] as const;

export interface Option {
  id: string;
  name: string;
}

function toDateInput(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Shared field set for the asset create/edit forms (server component). */
export function AssetFormFields({
  asset,
  categories,
  departments,
  locations,
  vendors,
}: {
  asset?: Asset;
  categories: Option[];
  departments: Option[];
  locations: Option[];
  vendors: Option[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="รหัสทรัพย์สิน / Asset Tag *">
        <Input name="assetTag" required maxLength={100} defaultValue={asset?.assetTag ?? ""} placeholder="IT-NB-0001" />
      </Field>
      <Field label="ชื่อทรัพย์สิน / Name *">
        <Input name="name" required maxLength={200} defaultValue={asset?.name ?? ""} />
      </Field>
      <Field label="หมายเลขซีเรียล / Serial Number">
        <Input name="serialNumber" defaultValue={asset?.serialNumber ?? ""} />
      </Field>
      <Field label="ยี่ห้อ / Brand">
        <Input name="brand" defaultValue={asset?.brand ?? ""} />
      </Field>
      <Field label="รุ่น / Model">
        <Input name="model" defaultValue={asset?.model ?? ""} />
      </Field>
      <Field label="หมวดหมู่ / Category">
        <Select name="categoryId" defaultValue={asset?.categoryId ?? ""}>
          <option value="">— ไม่ระบุ / None —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="แผนก / Department">
        <Select name="departmentId" defaultValue={asset?.departmentId ?? ""}>
          <option value="">— ไม่ระบุ / None —</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="สถานที่ / Location">
        <Select name="locationId" defaultValue={asset?.locationId ?? ""}>
          <option value="">— ไม่ระบุ / None —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="ผู้ขาย / Vendor">
        <Select name="vendorId" defaultValue={asset?.vendorId ?? ""}>
          <option value="">— ไม่ระบุ / None —</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="สภาพ / Condition">
        <Select name="condition" defaultValue={asset?.condition ?? "NEW"}>
          {ASSET_CONDITIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="วันที่ซื้อ / Purchase Date">
        <Input name="purchaseDate" type="date" defaultValue={toDateInput(asset?.purchaseDate)} />
      </Field>
      <Field label="ราคาซื้อ / Purchase Price (฿)">
        <Input name="purchasePrice" type="number" step="0.01" min="0" defaultValue={asset?.purchasePrice != null ? String(Number(asset.purchasePrice)) : ""} />
      </Field>
      <Field label="เริ่มประกัน / Warranty Start">
        <Input name="warrantyStart" type="date" defaultValue={toDateInput(asset?.warrantyStart)} />
      </Field>
      <Field label="สิ้นสุดประกัน / Warranty End">
        <Input name="warrantyEnd" type="date" defaultValue={toDateInput(asset?.warrantyEnd)} />
      </Field>
      <Field label="เลขที่ใบแจ้งหนี้ / Invoice Number">
        <Input name="invoiceNumber" defaultValue={asset?.invoiceNumber ?? ""} />
      </Field>
      <Field label="ศูนย์ต้นทุน / Cost Center">
        <Input name="costCenter" defaultValue={asset?.costCenter ?? ""} />
      </Field>
      <Field label="โครงการ / Project">
        <Input name="project" defaultValue={asset?.project ?? ""} />
      </Field>
      <Field label="IP Address">
        <Input name="ipAddress" defaultValue={asset?.ipAddress ?? ""} placeholder="192.168.1.10" />
      </Field>
      <Field label="สเปค / Specification" className="space-y-1.5 sm:col-span-2">
        <Textarea name="specification" rows={3} defaultValue={asset?.specification ?? ""} />
      </Field>
      <Field label="หมายเหตุ / Notes" className="space-y-1.5 sm:col-span-2">
        <Textarea name="notes" rows={3} defaultValue={asset?.notes ?? ""} />
      </Field>
    </div>
  );
}
