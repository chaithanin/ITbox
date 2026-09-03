import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDateTime } from "@/lib/utils";
import {
  setUserRolesAction, setUserStatusAction, adminResetPasswordAction,
  disableUserMfaAction, setUserEmployeeCodeAction,
} from "../../actions";

export const dynamic = "force-dynamic";

const PW_RULE = "รหัสผ่าน 8–12 ตัว มีพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ อย่างน้อยอย่างละ 1 ห้ามเว้นวรรค";
const PW_PATTERN = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9\\s])\\S{8,12}$";

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  "roles-saved": { text: "บันทึกบทบาท/สิทธิ์แล้ว / Roles saved" },
  "status-changed": { text: "เปลี่ยนสถานะบัญชีแล้ว / Status updated" },
  "code-set": { text: "บันทึกรหัสพนักงานแล้ว — จับคู่พนักงานอัตโนมัติ / Employee code saved & linked" },
  "code-exists": { text: "รหัสพนักงานนี้ถูกใช้กับบัญชีอื่นแล้ว / Employee code already in use", error: true },
  "password-reset": { text: "รีเซ็ตรหัสผ่านสำเร็จ (Session ถูกยกเลิกทั้งหมด) / Password reset" },
  "mfa-disabled": { text: "ปิด/รีเซ็ต MFA ของผู้ใช้แล้ว (Session ถูกยกเลิก) / User MFA reset" },
  "weak-password": { text: `${PW_RULE}`, error: true },
  "password-mismatch": { text: "รหัสผ่านและการยืนยันไม่ตรงกัน / Password and confirmation do not match", error: true },
  "password-reused": { text: "ห้ามใช้รหัสผ่านเดิมหรือที่เคยใช้ล่าสุด / Cannot reuse a recent password", error: true },
  "user-not-found": { text: "ไม่พบผู้ใช้ / User not found", error: true },
};

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requirePermission("user:manage");
  const { id } = await params;
  const sp = await searchParams;
  const msg = MESSAGES[sp.ok ?? sp.error ?? ""];

  const [u, roles] = await Promise.all([
    prisma.user.findFirst({
      where: { id, organizationId: admin.organizationId, deletedAt: null },
      include: {
        userRoles: {
          include: {
            role: { include: { rolePermissions: { include: { permission: true } } } },
          },
        },
        employee: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } },
      },
    }),
    prisma.role.findMany({
      where: { organizationId: admin.organizationId, deletedAt: null },
      orderBy: { key: "asc" },
    }),
  ]);
  if (!u) notFound();

  const currentRoleIds = new Set(u.userRoles.map((ur) => ur.roleId));
  const isSelf = u.id === admin.id;
  const isLocked = u.lockedUntil && u.lockedUntil > new Date();
  const returnTo = `/settings/users/${u.id}`;

  // Effective functions the user can access, from their assigned roles' default
  // permission sets — grouped by resource for a readable "what they can do" view.
  const effective = new Set<string>();
  for (const ur of u.userRoles) {
    for (const rp of ur.role.rolePermissions) effective.add(rp.permission.key);
  }
  const groups = new Map<string, string[]>();
  for (const key of [...effective].sort()) {
    const [resource] = key.split(":");
    groups.set(resource, [...(groups.get(resource) ?? []), key]);
  }

  return (
    <div className="max-w-4xl">
      <Link
        href="/settings/users"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> กลับไปรายชื่อผู้ใช้ / Back to users
      </Link>

      <PageHeader title={u.name} description={u.email} />

      {msg && (
        <p className={`mb-4 rounded-md px-3 py-2 text-sm ${msg.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {msg.text}
        </p>
      )}

      {/* Snapshot */}
      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">สถานะ / Status</p>
            <div className="mt-1 flex items-center gap-1"><StatusBadge status={u.status} />{isLocked && <Badge variant="destructive">ล็อกชั่วคราว</Badge>}</div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">MFA</p>
            <div className="mt-1">{u.mfaEnabled ? <Badge variant="success">เปิด / On</Badge> : <Badge variant="secondary">ปิด / Off</Badge>}</div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">พนักงาน / Employee</p>
            <p className="mt-1 text-sm">{u.employee ? `${u.employee.firstName} ${u.employee.lastName}${u.employee.department?.name ? ` · ${u.employee.department.name}` : ""}` : "— ยังไม่ผูก"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">เข้าระบบล่าสุด / Last login</p>
            <p className="mt-1 text-sm">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "-"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Roles (levels) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">บทบาท / Roles (ระดับการเข้าถึง)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              เลือกบทบาทเพื่อกำหนดฟังก์ชันที่ผู้ใช้เข้าถึงได้ (อ้างอิงสิทธิ์เริ่มต้นของแต่ละบทบาท)
            </p>
            <form action={setUserRolesAction.bind(null, u.id)} className="space-y-2">
              <input type="hidden" name="returnTo" value={returnTo} />
              <div className="space-y-1.5">
                {roles.map((r) => (
                  <label key={r.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="roleIds"
                      value={r.id}
                      defaultChecked={currentRoleIds.has(r.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span>{r.nameTh ?? r.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{r.key}</span>
                  </label>
                ))}
              </div>
              <Button type="submit" size="sm" className="mt-2">บันทึกบทบาท / Save roles</Button>
            </form>
          </CardContent>
        </Card>

        {/* Effective functions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ฟังก์ชันที่เข้าถึงได้ / Functions</CardTitle>
          </CardHeader>
          <CardContent>
            {groups.size === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีสิทธิ์ — เลือกบทบาทก่อน</p>
            ) : (
              <div className="space-y-2">
                {[...groups.entries()].map(([resource, keys]) => (
                  <div key={resource}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{resource}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {keys.map((k) => (
                        <span key={k} className="rounded border px-1.5 py-0.5 font-mono text-[10px]">{k.split(":")[1]}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Employee code */}
      <Card className="mt-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">รหัสพนักงาน / Employee code</CardTitle></CardHeader>
        <CardContent>
          <form action={setUserEmployeeCodeAction.bind(null, u.id)} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="space-y-1">
              <Label htmlFor="employeeCode">รหัสพนักงาน (Staff ID)</Label>
              <Input id="employeeCode" name="employeeCode" defaultValue={u.employeeCode ?? ""} maxLength={50} placeholder="เช่น EMP001" className="w-48" />
            </div>
            <Button type="submit" variant="outline" size="sm">บันทึก & ผูกพนักงาน / Save & link</Button>
            <p className="w-full text-xs text-muted-foreground">ผูกบัญชีกับข้อมูลพนักงาน HR แบบแม่นยำด้วยรหัสพนักงาน</p>
          </form>
        </CardContent>
      </Card>

      {/* Account actions */}
      {!isSelf ? (
        <Card className="mt-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm">การจัดการบัญชี / Account actions</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:flex-wrap">
            <form action={setUserStatusAction.bind(null, u.id)}>
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="status" value={u.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
              <ConfirmButton
                variant={u.status === "ACTIVE" ? "destructive" : "secondary"}
                size="sm"
                confirmText={u.status === "ACTIVE" ? "ปิดใช้งานบัญชีนี้? (Session ทั้งหมดจะถูกยกเลิก)" : "เปิดใช้งานบัญชีนี้?"}
              >
                {u.status === "ACTIVE" ? "ปิดใช้งาน / Disable" : "เปิดใช้งาน / Enable"}
              </ConfirmButton>
            </form>

            {u.mfaEnabled && (
              <form action={disableUserMfaAction.bind(null, u.id)}>
                <input type="hidden" name="returnTo" value={returnTo} />
                <ConfirmButton variant="outline" size="sm" confirmText="ปิด/รีเซ็ต MFA ของผู้ใช้นี้? ผู้ใช้จะต้องตั้งค่าใหม่เอง และ Session จะถูกยกเลิก">
                  ปิด/รีเซ็ต MFA
                </ConfirmButton>
              </form>
            )}

            <form action={adminResetPasswordAction.bind(null, u.id)} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="returnTo" value={returnTo} />
              <Input name="password" type="password" required minLength={8} maxLength={12} pattern={PW_PATTERN} title={PW_RULE} placeholder="รหัสผ่านใหม่" className="h-9 w-36 text-sm" autoComplete="new-password" />
              <Input name="confirmPassword" type="password" required minLength={8} maxLength={12} placeholder="ยืนยัน" className="h-9 w-28 text-sm" autoComplete="new-password" />
              <ConfirmButton variant="outline" size="sm" confirmText="รีเซ็ตรหัสผ่าน? Session ทั้งหมดจะถูกยกเลิก">รีเซ็ตรหัสผ่าน</ConfirmButton>
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">นี่คือบัญชีของคุณเอง — จัดการรหัสผ่าน/MFA ได้ที่ Settings → Profile</p>
      )}
    </div>
  );
}
