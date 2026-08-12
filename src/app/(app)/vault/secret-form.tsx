import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PasswordField, RegenerateHint } from "./password-tools";
import type { VaultCategory, Department, VaultItem } from "@prisma/client";
import Link from "next/link";

const TYPES = [
  "PASSWORD", "SERVER", "DATABASE", "API_KEY", "SSH_KEY", "WIFI",
  "NETWORK_DEVICE", "CERTIFICATE", "LICENSE_KEY", "TOKEN", "OTHER",
];

/** Shared create/edit form. Secret values are never pre-filled on edit. */
export function SecretForm({
  action,
  item,
  categories,
  departments,
  submitLabel,
  cancelHref,
}: {
  action: (formData: FormData) => Promise<void>;
  item?: VaultItem | null;
  categories: VaultCategory[];
  departments: Department[];
  submitLabel: string;
  cancelHref: string;
}) {
  return (
    <form action={action} className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>ข้อมูลทั่วไป / General</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">ชื่อรายการ / Name *</Label>
            <Input id="name" name="name" required maxLength={200} defaultValue={item?.name} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type">ประเภท / Type</Label>
            <Select id="type" name="type" defaultValue={item?.type ?? "PASSWORD"}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t.replaceAll("_", " ")}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="classification">ระดับความลับ / Classification</Label>
            <Select id="classification" name="classification" defaultValue={item?.classification ?? "MEDIUM"}>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH — ต้องใช้ MFA</option>
              <option value="CRITICAL">CRITICAL — ต้องใช้ MFA</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="categoryId">หมวดหมู่ / Category</Label>
            <Select id="categoryId" name="categoryId" defaultValue={item?.categoryId ?? ""}>
              <option value="">— ไม่ระบุ —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="departmentId">แผนก / Department</Label>
            <Select id="departmentId" name="departmentId" defaultValue={item?.departmentId ?? ""}>
              <option value="">— ไม่ระบุ —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="environment">Environment</Label>
            <Select id="environment" name="environment" defaultValue={item?.environment ?? ""}>
              <option value="">— ไม่ระบุ —</option>
              <option value="Production">Production</option>
              <option value="Staging">Staging</option>
              <option value="Development">Development</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" name="username" defaultValue={item?.username ?? ""} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="url">URL</Label>
            <Input id="url" name="url" defaultValue={item?.url ?? ""} placeholder="https://..." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="host">Host / IP</Label>
            <Input id="host" name="host" defaultValue={item?.host ?? ""} placeholder="10.0.0.1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="port">Port</Label>
              <Input id="port" name="port" type="number" min={1} max={65535} defaultValue={item?.port ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="protocol">Protocol</Label>
              <Input id="protocol" name="protocol" defaultValue={item?.protocol ?? ""} placeholder="SSH, RDP, HTTPS..." />
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tags">Tags (คั่นด้วย ,)</Label>
            <Input id="tags" name="tags" defaultValue={item?.tags?.join(", ") ?? ""} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="notes">หมายเหตุ / Notes</Label>
            <Textarea id="notes" name="notes" rows={2} defaultValue={item?.notes ?? ""} />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลลับ / Secret</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {item && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                เว้นว่างไว้เพื่อคงข้อมูลลับเดิม — กรอกเฉพาะเมื่อต้องการเปลี่ยน /
                Leave blank to keep the existing secret.
              </p>
            )}
            <div className="space-y-1.5">
              <Label>รหัสผ่าน / Password</Label>
              <PasswordField name="password" />
              <RegenerateHint />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apiKey">API Key</Label>
              <Input id="apiKey" name="apiKey" autoComplete="off" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="token">Token</Label>
              <Input id="token" name="token" autoComplete="off" className="font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sshPrivateKey">SSH Private Key</Label>
              <Textarea id="sshPrivateKey" name="sshPrivateKey" rows={3} className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sshPublicKey">SSH Public Key</Label>
              <Textarea id="sshPublicKey" name="sshPublicKey" rows={2} className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="certificate">Certificate</Label>
              <Textarea id="certificate" name="certificate" rows={3} className="font-mono text-xs" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>นโยบาย / Policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="rotationDays">รอบเปลี่ยนรหัส (วัน) / Rotation every (days)</Label>
              <Select id="rotationDays" name="rotationDays" defaultValue={String(item?.rotationDays ?? "")}>
                <option value="">ไม่กำหนด / None</option>
                <option value="30">30 วัน</option>
                <option value="60">60 วัน</option>
                <option value="90">90 วัน</option>
                <option value="180">180 วัน</option>
                <option value="365">365 วัน</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiresAt">วันหมดอายุ / Expiration date</Label>
              <Input
                id="expiresAt"
                name="expiresAt"
                type="date"
                defaultValue={item?.expiresAt ? item.expiresAt.toISOString().slice(0, 10) : ""}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="requireMfaToReveal"
                defaultChecked={item?.requireMfaToReveal ?? false}
                className="h-4 w-4 rounded border-input"
              />
              บังคับ MFA ก่อนเปิดเผย (HIGH/CRITICAL บังคับอยู่แล้ว)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="requireApprovalToReveal"
                defaultChecked={item?.requireApprovalToReveal ?? false}
                className="h-4 w-4 rounded border-input"
              />
              ต้องได้รับอนุมัติก่อนเปิดเผย / Require approval to reveal
            </label>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" className="flex-1">{submitLabel}</Button>
          <Button type="button" variant="outline" asChild>
            <Link href={cancelHref}>ยกเลิก / Cancel</Link>
          </Button>
        </div>
      </div>
    </form>
  );
}
