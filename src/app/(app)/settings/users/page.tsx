import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDateTime } from "@/lib/utils";
import {
  createUserAction, setUserStatusAction, setUserRolesAction, adminResetPasswordAction,
  disableUserMfaAction, setUserEmployeeCodeAction,
} from "../actions";

export const dynamic = "force-dynamic";

const PW_RULE = "รหัสผ่าน 8–12 ตัว มีพิมพ์ใหญ่ พิมพ์เล็ก ตัวเลข และอักขระพิเศษ อย่างน้อยอย่างละ 1 ห้ามเว้นวรรค";

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  "user-created": { text: "สร้างผู้ใช้สำเร็จ / User created" },
  "code-set": { text: "บันทึกรหัสพนักงานแล้ว — จับคู่กับพนักงานให้อัตโนมัติ / Employee code saved & linked" },
  "code-exists": { text: "รหัสพนักงานนี้ถูกใช้กับบัญชีอื่นแล้ว / Employee code already in use", error: true },
  "password-reset": { text: "รีเซ็ตรหัสผ่านสำเร็จ (Session ถูกยกเลิกทั้งหมด) / Password reset" },
  "mfa-disabled": { text: "ปิด/รีเซ็ต MFA ของผู้ใช้แล้ว (Session ถูกยกเลิก) / User MFA reset", error: false },
  "weak-password": { text: `${PW_RULE} / Password must be 8–12 chars with upper, lower, number & special char`, error: true },
  "password-mismatch": { text: "รหัสผ่านและการยืนยันไม่ตรงกัน / Password and confirmation do not match", error: true },
  "password-reused": { text: "ห้ามใช้รหัสผ่านเดิมหรือที่เคยใช้ล่าสุด / Cannot reuse the current or a recent password", error: true },
  "invalid-input": { text: "ข้อมูลไม่ถูกต้อง — ตรวจอีเมลและรหัสผ่าน / Invalid input", error: true },
  "email-exists": { text: "อีเมลนี้มีผู้ใช้อยู่แล้ว / Email already exists", error: true },
  "role-not-found": { text: "ไม่พบบทบาทที่เลือก / Role not found", error: true },
  "user-not-found": { text: "ไม่พบผู้ใช้ / User not found", error: true },
};

const PW_PATTERN = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9\\s])\\S{8,12}$";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const admin = await requirePermission("user:manage");
  const sp = await searchParams;
  const msg = MESSAGES[sp.ok ?? sp.error ?? ""];
  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId: admin.organizationId, deletedAt: null },
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: "asc" },
      take: 500,
    }),
    prisma.role.findMany({
      where: { organizationId: admin.organizationId, deletedAt: null },
      orderBy: { key: "asc" },
    }),
  ]);

  return (
    <div>
      <PageHeader title="ผู้ใช้งาน / Users" description="สร้างบัญชี กำหนดบทบาท และควบคุมการเข้าถึง" />

      {msg && (
        <p className={`mb-4 rounded-md px-3 py-2 text-sm ${msg.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {msg.text}
        </p>
      )}

      <Card className="mb-4">
        <CardHeader><CardTitle>สร้างผู้ใช้ใหม่ / Create User</CardTitle></CardHeader>
        <CardContent>
          <form action={createUserAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1">
              <Label htmlFor="email">อีเมล / Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">ชื่อ / Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="employeeCode">รหัสพนักงาน / Staff ID</Label>
              <Input id="employeeCode" name="employeeCode" maxLength={50} placeholder="เช่น EMP001 (ไม่บังคับ)" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">รหัสผ่าน / Password</Label>
              <Input
                id="password" name="password" type="password" required
                minLength={8} maxLength={12} pattern={PW_PATTERN} title={PW_RULE}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">ยืนยันรหัสผ่าน / Confirm</Label>
              <Input
                id="confirmPassword" name="confirmPassword" type="password" required
                minLength={8} maxLength={12} autoComplete="new-password"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="roleId">บทบาท / Role</Label>
              <Select id="roleId" name="roleId" required>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.nameTh ?? r.name} ({r.key})</option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">สร้าง / Create</Button>
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-6">{PW_RULE}</p>
          </form>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ผู้ใช้ / User</TableHead>
            <TableHead>บทบาท / Roles</TableHead>
            <TableHead>MFA</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead>เข้าระบบล่าสุด</TableHead>
            <TableHead>จัดการ / Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const statusAction = setUserStatusAction.bind(null, u.id);
            const rolesAction = setUserRolesAction.bind(null, u.id);
            const resetAction = adminResetPasswordAction.bind(null, u.id);
            const mfaOffAction = disableUserMfaAction.bind(null, u.id);
            const codeAction = setUserEmployeeCodeAction.bind(null, u.id);
            const isLocked = u.lockedUntil && u.lockedUntil > new Date();
            return (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                  <form action={codeAction} className="mt-1 flex items-center gap-1">
                    <Input
                      name="employeeCode" defaultValue={u.employeeCode ?? ""} maxLength={50}
                      placeholder="รหัสพนักงาน" className="h-6 w-28 text-[11px]"
                      title="รหัสพนักงาน (Staff ID) — ผูกบัญชีกับพนักงาน HR แบบแม่นยำ"
                    />
                    <Button type="submit" variant="outline" size="sm" className="h-6 px-2 text-[11px]">ผูก</Button>
                  </form>
                </TableCell>
                <TableCell>
                  <form action={rolesAction} className="flex flex-wrap items-center gap-1.5">
                    <select
                      name="roleIds"
                      multiple
                      defaultValue={u.userRoles.map((ur) => ur.roleId)}
                      className="max-w-[11rem] rounded border bg-card p-1 text-xs"
                      size={3}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.key}</option>
                      ))}
                    </select>
                    <Button type="submit" variant="outline" size="sm">บันทึก</Button>
                  </form>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    {u.mfaEnabled
                      ? <Badge variant="success">เปิด / On</Badge>
                      : <Badge variant="secondary">ปิด / Off</Badge>}
                    {u.mfaEnabled ? (
                      <form action={mfaOffAction}>
                        <ConfirmButton
                          variant="outline" size="sm"
                          confirmText="ปิด/รีเซ็ต MFA ของผู้ใช้นี้? ผู้ใช้จะต้องตั้งค่าใหม่เอง และ Session จะถูกยกเลิก"
                        >
                          ปิด/รีเซ็ต MFA
                        </ConfirmButton>
                      </form>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        ผู้ใช้เปิดเองในโปรไฟล์
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <StatusBadge status={u.status} />
                    {isLocked && <Badge variant="destructive">ล็อกชั่วคราว</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "-"}
                </TableCell>
                <TableCell>
                  {u.id !== admin.id ? (
                    <div className="flex flex-col gap-1.5">
                      <form action={statusAction}>
                        <input type="hidden" name="status" value={u.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                        <ConfirmButton
                          variant={u.status === "ACTIVE" ? "destructive" : "secondary"}
                          size="sm"
                          confirmText={u.status === "ACTIVE" ? "ปิดใช้งานบัญชีนี้? (Session ทั้งหมดจะถูกยกเลิก)" : "เปิดใช้งานบัญชีนี้?"}
                        >
                          {u.status === "ACTIVE" ? "ปิดใช้งาน / Disable" : "เปิดใช้งาน / Enable"}
                        </ConfirmButton>
                      </form>
                      <form action={resetAction} className="flex flex-wrap gap-1">
                        <Input
                          name="password" type="password" required
                          minLength={8} maxLength={12} pattern={PW_PATTERN} title={PW_RULE}
                          placeholder="รหัสผ่านใหม่" className="h-7 w-28 text-xs" autoComplete="new-password"
                        />
                        <Input
                          name="confirmPassword" type="password" required
                          minLength={8} maxLength={12}
                          placeholder="ยืนยัน" className="h-7 w-24 text-xs" autoComplete="new-password"
                        />
                        <ConfirmButton variant="outline" size="sm" confirmText="รีเซ็ตรหัสผ่าน? Session ทั้งหมดจะถูกยกเลิก">
                          รีเซ็ต
                        </ConfirmButton>
                      </form>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">(คุณ / you)</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
