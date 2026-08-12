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
} from "../actions";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await requirePermission("user:manage");
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

      <Card className="mb-4">
        <CardHeader><CardTitle>สร้างผู้ใช้ใหม่ / Create User</CardTitle></CardHeader>
        <CardContent>
          <form action={createUserAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="email">อีเมล / Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">ชื่อ / Name</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">รหัสผ่านเริ่มต้น (≥12) / Initial password</Label>
              <Input id="password" name="password" type="password" minLength={12} required autoComplete="new-password" />
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
            const isLocked = u.lockedUntil && u.lockedUntil > new Date();
            return (
              <TableRow key={u.id}>
                <TableCell>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
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
                  {u.mfaEnabled
                    ? <Badge variant="success">เปิด / On</Badge>
                    : <Badge variant="secondary">ปิด / Off</Badge>}
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
                      <form action={resetAction} className="flex gap-1">
                        <Input
                          name="password" type="password" minLength={12} required
                          placeholder="รหัสผ่านใหม่" className="h-7 w-32 text-xs" autoComplete="new-password"
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
