"use client";

import { useState } from "react";
import { Plus, Trash2, KeyRound, Mail, Laptop, AppWindow, ShieldCheck, GraduationCap, Save, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface AssetOption {
  id: string;
  label: string;
}
export interface SoftwareOption {
  name: string;
  vendor: string | null;
}

interface Props {
  action: (formData: FormData) => void | Promise<void>;
  canManage: boolean;
  accessFormUrl: string;
  initial: {
    accountUsername: string | null;
    emailAddress: string | null;
    emailPasswordSet: boolean;
    softwareInstalled: string[];
    accessGranted: boolean;
    inductionDone: boolean;
    note: string | null;
  };
  availableAssets: AssetOption[];
  currentDevices: { assetTag: string; name: string }[];
  softwareOptions: SoftwareOption[];
}

const StepHeader = ({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint?: string }) => (
  <CardHeader className="pb-3">
    <CardTitle className="flex items-center gap-2 text-sm">
      <Icon className="h-4 w-4 text-primary" /> {title}
    </CardTitle>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </CardHeader>
);

export function OnboardingDetailForm({
  action,
  canManage,
  accessFormUrl,
  initial,
  availableAssets,
  currentDevices,
  softwareOptions,
}: Props) {
  // One empty device row to start; users can add unlimited rows.
  const [deviceRows, setDeviceRows] = useState<string[]>([""]);
  const disabled = !canManage;

  return (
    <form action={action} className="space-y-4">
      {/* 1. Account */}
      <Card>
        <StepHeader icon={KeyRound} title="สร้างบัญชีผู้ใช้ / Account" hint="ชื่อบัญชี/รหัสผู้ใช้ที่สร้างให้พนักงาน" />
        <CardContent>
          <Label htmlFor="accountUsername">ชื่อบัญชี / Account username</Label>
          <Input
            id="accountUsername"
            name="accountUsername"
            defaultValue={initial.accountUsername ?? ""}
            placeholder="เช่น somchai.j / GTG-10673"
            disabled={disabled}
            className="mt-1 max-w-md"
          />
        </CardContent>
      </Card>

      {/* 2. Email */}
      <Card>
        <StepHeader icon={Mail} title="สร้างอีเมล / Email" hint="อีเมล + รหัสผ่าน (รหัสผ่านถูกเก็บใน Vault แบบเข้ารหัส ไม่เก็บเป็นข้อความธรรมดา)" />
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="emailAddress">อีเมล / Email</Label>
            <Input
              id="emailAddress"
              name="emailAddress"
              type="email"
              defaultValue={initial.emailAddress ?? ""}
              placeholder="name@chaithanin.com"
              disabled={disabled}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="emailPassword">
              รหัสผ่านอีเมล / Email password{" "}
              {initial.emailPasswordSet && (
                <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  บันทึกใน Vault แล้ว / saved
                </span>
              )}
            </Label>
            <Input
              id="emailPassword"
              name="emailPassword"
              type="password"
              autoComplete="new-password"
              placeholder={initial.emailPasswordSet ? "เว้นว่างไว้เพื่อคงรหัสเดิม" : "กรอกเพื่อบันทึกลง Vault"}
              disabled={disabled}
              className="mt-1"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">🔒 เก็บใน Vault (AES-256/KMS) — ดูภายหลังได้ที่โมดูล Vault</p>
          </div>
        </CardContent>
      </Card>

      {/* 3. Device */}
      <Card>
        <StepHeader icon={Laptop} title="มอบอุปกรณ์ / Device" hint="เลือกทรัพย์สินที่ว่างเพื่อมอบให้พนักงาน กดเพิ่มได้ไม่จำกัด" />
        <CardContent className="space-y-2">
          {currentDevices.length > 0 && (
            <div className="mb-2 rounded-md border bg-muted/30 p-2 text-xs">
              <span className="font-medium">อุปกรณ์ที่ถือครองอยู่แล้ว / Already held: </span>
              {currentDevices.map((d) => `${d.assetTag} — ${d.name}`).join(", ")}
            </div>
          )}
          {deviceRows.map((val, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select
                name="deviceAssetId"
                value={val}
                disabled={disabled}
                onChange={(e) => {
                  const next = [...deviceRows];
                  next[i] = e.target.value;
                  setDeviceRows(next);
                }}
                className="flex-1"
              >
                <option value="">— เลือกทรัพย์สินที่ว่าง / Select available asset —</option>
                {availableAssets.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={disabled || deviceRows.length === 1}
                onClick={() => setDeviceRows(deviceRows.filter((_, idx) => idx !== i))}
                title="ลบแถว / Remove"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setDeviceRows([...deviceRows, ""])}
          >
            <Plus className="h-4 w-4" /> เพิ่มอุปกรณ์ / Add device
          </Button>
          {availableAssets.length === 0 && (
            <p className="text-xs text-muted-foreground">ไม่มีทรัพย์สินสถานะ AVAILABLE ในระบบ</p>
          )}
        </CardContent>
      </Card>

      {/* 4. Software */}
      <Card>
        <StepHeader icon={AppWindow} title="ติดตั้งซอฟต์แวร์ / Software" hint="เลือกซอฟต์แวร์ที่ติดตั้งให้พนักงาน (จากรายการ License ในระบบ)" />
        <CardContent>
          {softwareOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีรายการซอฟต์แวร์/License ในระบบ</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {softwareOptions.map((s) => (
                <label key={s.name} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <input
                    type="checkbox"
                    name="software"
                    value={s.name}
                    defaultChecked={initial.softwareInstalled.includes(s.name)}
                    disabled={disabled}
                    className="h-4 w-4"
                  />
                  <span>
                    {s.name}
                    {s.vendor && <span className="block text-[11px] text-muted-foreground">{s.vendor}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5. Access — next phase, backed by the request form */}
      <Card>
        <StepHeader icon={ShieldCheck} title="ให้สิทธิ์เข้าถึง / Access" hint="ทำในเฟสต่อไป — ใช้แบบฟอร์มขอสิทธิ์การใช้งานระบบสารสนเทศ" />
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <a
              href="/documents/access-request"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <ShieldCheck className="h-4 w-4" /> เปิดฟอร์มขอสิทธิ์ (RBAC) / Open Access Request
            </a>
            <a
              href={accessFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-primary hover:bg-accent"
            >
              <Download className="h-4 w-4" /> แบบฟอร์มต้นฉบับ / Original form (PDF)
            </a>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="accessGranted" defaultChecked={initial.accessGranted} disabled={disabled} className="h-4 w-4" />
            ให้สิทธิ์เข้าถึงเรียบร้อยแล้ว / Access granted
          </label>
        </CardContent>
      </Card>

      {/* 6. Induction */}
      <Card>
        <StepHeader icon={GraduationCap} title="ปฐมนิเทศ IT / Induction" />
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="inductionDone" defaultChecked={initial.inductionDone} disabled={disabled} className="h-4 w-4" />
            ปฐมนิเทศ IT เรียบร้อยแล้ว / IT induction completed
          </label>
          <div>
            <Label htmlFor="note">หมายเหตุ / Note</Label>
            <Textarea id="note" name="note" defaultValue={initial.note ?? ""} disabled={disabled} rows={2} className="mt-1" />
          </div>
        </CardContent>
      </Card>

      {canManage && (
        <div className="flex justify-end">
          <Button type="submit">
            <Save className="h-4 w-4" /> บันทึก / Save
          </Button>
        </div>
      )}
    </form>
  );
}
