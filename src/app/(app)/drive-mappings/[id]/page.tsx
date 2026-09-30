import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, KeyRound, Trash2, FileText, FileCode } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";
import { updateDriveMapping, setDriveCredential, deleteDriveMapping } from "../actions";

const STATUSES = ["DRAFT", "ACTIVE", "DONE"] as const;

export default async function DriveMappingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("support:read");
  const { id } = await params;
  const sp = await searchParams;
  const canManage = user.permissions.has("support:work");
  const canVault = user.permissions.has("vault:create");
  const readOnly = !canManage;

  const r = await prisma.driveMapping.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null } });
  if (!r) notFound();

  // Confirm the linked credential still exists (org-scoped) so we only link a live item.
  const cred = r.credentialVaultItemId
    ? await prisma.vaultItem.findFirst({ where: { id: r.credentialVaultItemId, organizationId: user.organizationId, deletedAt: null }, select: { id: true, username: true } })
    : null;

  const save = updateDriveMapping.bind(null, r.id);
  const setCred = setDriveCredential.bind(null, r.id);
  const del = deleteDriveMapping.bind(null, r.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/drive-mappings"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title={r.employeeName || r.computerName || "Drive & User Setup"} description={[r.employeeCode, r.nickname, r.position].filter(Boolean).join(" · ")}>
        <Button variant="outline" asChild><a href={`/api/drive-mappings/${r.id}/pdf`} target="_blank" rel="noopener"><FileText className="h-4 w-4" /> ใบส่งมอบ / PDF</a></Button>
        <Button variant="outline" asChild><a href={`/api/drive-mappings/${r.id}/script`}><FileCode className="h-4 w-4" /> สคริปต์ .bat</a></Button>
        <StatusBadge status={r.status} />
      </PageHeader>

      {sp.ok === "created" && <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">สร้างแล้ว / Created</div>}
      {sp.ok === "saved" && <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">บันทึกแล้ว / Saved</div>}
      {sp.ok === "cred" && <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">อัปเดตรหัสผ่านใน Vault แล้ว / Credential saved</div>}
      {sp.error === "nopass" && <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">กรุณากรอกรหัสผ่าน / Password required</div>}

      {/* Credential (Vault) */}
      <Card className="mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">บัญชีผู้ใช้ / User account</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <div><span className="text-muted-foreground">Computer/User:</span> <span className="font-mono">{r.computerName ?? "—"}</span></div>
            <div><span className="text-muted-foreground">User Share:</span> <span className="font-mono">{r.userShare ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Login user:</span> <span className="font-mono">{r.loginUsername ?? r.computerName ?? "—"}</span></div>
            <div>
              <span className="text-muted-foreground">รหัสผ่าน / Password:</span>{" "}
              {cred ? (
                <Link href={`/vault/${cred.id}`} className="text-primary hover:underline">•••••• (เปิดใน Vault)</Link>
              ) : <span className="text-muted-foreground">— ยังไม่ได้ตั้ง —</span>}
            </div>
          </div>
          {canVault && (
            <form action={setCred} className="flex flex-wrap items-end gap-2 border-t pt-3">
              <div className="space-y-1">
                <Label htmlFor="loginUsername" className="text-xs">Login user name</Label>
                <Input id="loginUsername" name="loginUsername" defaultValue={r.loginUsername ?? r.computerName ?? ""} className="h-8 w-48" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password" className="text-xs">{cred ? "รหัสผ่านใหม่ / New password" : "รหัสผ่าน / Password"}</Label>
                <Input id="password" name="password" type="password" autoComplete="new-password" className="h-8 w-48" />
              </div>
              <Button type="submit" size="sm" variant="outline"><KeyRound className="h-4 w-4" /> {cred ? "เปลี่ยนรหัส / Rotate" : "ตั้งรหัส / Set"}</Button>
            </form>
          )}
          <p className="text-xs text-muted-foreground">รหัสผ่านเก็บเข้ารหัสใน Vault (AES-256-GCM + KMS) — เปิด/คัดลอกผ่านหน้า Vault ที่มีการบันทึก log</p>
        </CardContent>
      </Card>

      {/* Drives */}
      <Card className="mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">ไดรฟ์ที่ map / Mapped drives ({r.drives.length})</CardTitle></CardHeader>
        <CardContent>
          {r.drives.length === 0 ? (
            <p className="text-sm text-muted-foreground">— ไม่มี —</p>
          ) : (
            <ul className="space-y-1 font-mono text-xs">
              {r.drives.map((d, i) => <li key={i} className="rounded bg-muted/40 px-2 py-1 break-all">{d}</li>)}
            </ul>
          )}
          {r.notes && <p className="mt-3 text-sm"><span className="text-muted-foreground">หมายเหตุ:</span> {r.notes}</p>}
        </CardContent>
      </Card>

      {/* Edit */}
      {canManage && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm">แก้ไข / Edit</CardTitle></CardHeader>
          <CardContent>
            <form action={save} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5"><Label htmlFor="employeeName">ชื่อ / Name</Label><Input id="employeeName" name="employeeName" defaultValue={r.employeeName ?? ""} /></div>
                <div className="space-y-1.5"><Label htmlFor="nickname">ชื่อเล่น / Nickname</Label><Input id="nickname" name="nickname" defaultValue={r.nickname ?? ""} /></div>
                <div className="space-y-1.5"><Label htmlFor="employeeCode">รหัสพนักงาน / Staff ID</Label><Input id="employeeCode" name="employeeCode" defaultValue={r.employeeCode ?? ""} /></div>
                <div className="space-y-1.5"><Label htmlFor="position">ตำแหน่ง / Position</Label><Input id="position" name="position" defaultValue={r.position ?? ""} /></div>
                <div className="space-y-1.5"><Label htmlFor="computerName">Computer and User name</Label><Input id="computerName" name="computerName" defaultValue={r.computerName ?? ""} /></div>
                <div className="space-y-1.5"><Label htmlFor="userShare">User Share</Label><Input id="userShare" name="userShare" defaultValue={r.userShare ?? ""} /></div>
                <div className="space-y-1.5"><Label htmlFor="loginUsername2">Login user name</Label><Input id="loginUsername2" name="loginUsername" defaultValue={r.loginUsername ?? ""} /></div>
                <div className="space-y-1.5">
                  <Label htmlFor="status">สถานะ / Status</Label>
                  <Select id="status" name="status" defaultValue={r.status}>{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="drives">Drive (1 บรรทัดต่อ 1 พาธ)</Label>
                <Textarea id="drives" name="drives" rows={6} className="font-mono text-xs" defaultValue={r.drives.join("\n")} />
              </div>
              <div className="space-y-1.5"><Label htmlFor="notes">หมายเหตุ / Notes</Label><Input id="notes" name="notes" defaultValue={r.notes ?? ""} /></div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">อัปเดตล่าสุด {formatDate(r.updatedAt)}</span>
                <Button type="submit">บันทึก / Save</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {canManage && (
        <form action={del} className="border-t pt-4">
          <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" /> ลบ / Delete</Button>
        </form>
      )}
      {readOnly && <p className="text-xs text-muted-foreground">ดูอย่างเดียว (ต้องมีสิทธิ์ support:work เพื่อแก้ไข)</p>}
    </div>
  );
}
