import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDateTime } from "@/lib/utils";
import {
  updateProfileAction, changePasswordAction, startMfaEnrollmentAction,
  confirmMfaEnrollmentAction, disableMfaAction, revokeSessionAction,
  revokeAllSessionsAction, deletePasskeyAction,
} from "../actions";
import { AddPasskeyButton } from "./passkeys";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  "password-changed": { text: "เปลี่ยนรหัสผ่านแล้ว / Password changed" },
  "mfa-enabled": { text: "เปิดใช้ MFA แล้ว / MFA enabled" },
  "mfa-disabled": { text: "ปิด MFA แล้ว / MFA disabled" },
  "wrong-password": { text: "รหัสผ่านปัจจุบันไม่ถูกต้อง / Wrong current password", error: true },
  "weak-password": { text: "รหัสผ่าน 8–12 ตัว มีพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข อย่างน้อยอย่างละ 1 ห้ามเว้นวรรค / Must be 8–12 chars with upper, lower & number", error: true },
  "password-mismatch": { text: "รหัสผ่านใหม่และการยืนยันไม่ตรงกัน / New password and confirmation do not match", error: true },
  "mfa-invalid": { text: "รหัส MFA ไม่ถูกต้อง / Invalid MFA code", error: true },
};

const PW_RULE_PROFILE = "รหัสผ่าน 8–12 ตัว มีพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข อย่างน้อยอย่างละ 1 (แนะนำมีอักขระพิเศษ) ห้ามเว้นวรรค";
const PW_PATTERN_PROFILE = "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)\\S{8,12}$";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const sessions = await prisma.userSession.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    take: 20,
  });
  const passkeys = await prisma.webAuthnCredential.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  const enrollmentPending = !dbUser.mfaEnabled && !!dbUser.totpSecretEnc;
  const msg = MESSAGES[sp.ok ?? sp.error ?? ""];

  return (
    <div>
      <PageHeader title="โปรไฟล์และความปลอดภัย / Profile & Security" />
      {msg && (
        <p className={`mb-4 rounded-md px-3 py-2 text-sm ${msg.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {msg.text}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>ข้อมูลส่วนตัว / Profile</CardTitle></CardHeader>
          <CardContent>
            <form action={updateProfileAction} className="space-y-3">
              <div className="space-y-1">
                <Label>อีเมล / Email</Label>
                <Input value={user.email} disabled />
              </div>
              <div className="space-y-1">
                <Label htmlFor="name">ชื่อ / Name</Label>
                <Input id="name" name="name" defaultValue={dbUser.name} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="locale">ภาษาเริ่มต้น / Preferred language</Label>
                <Select id="locale" name="locale" defaultValue={dbUser.locale}>
                  <option value="th">ไทย</option>
                  <option value="en">English</option>
                </Select>
              </div>
              <Button type="submit">บันทึก / Save</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>เปลี่ยนรหัสผ่าน / Change Password</CardTitle></CardHeader>
          <CardContent>
            <form action={changePasswordAction} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="current">รหัสผ่านปัจจุบัน / Current password</Label>
                <Input id="current" name="current" type="password" required autoComplete="current-password" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="next">รหัสผ่านใหม่ / New password</Label>
                <Input
                  id="next" name="next" type="password" required
                  minLength={8} maxLength={12} pattern={PW_PATTERN_PROFILE} title={PW_RULE_PROFILE}
                  autoComplete="new-password"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm">ยืนยันรหัสผ่านใหม่ / Confirm new password</Label>
                <Input
                  id="confirm" name="confirm" type="password" required
                  minLength={8} maxLength={12} autoComplete="new-password"
                />
              </div>
              <p className="text-xs text-muted-foreground">{PW_RULE_PROFILE}</p>
              <Button type="submit">เปลี่ยนรหัสผ่าน / Change</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              MFA (TOTP)
              {dbUser.mfaEnabled
                ? <Badge variant="success">เปิดใช้งาน / Enabled</Badge>
                : <Badge variant="secondary">ปิด / Disabled</Badge>}
            </CardTitle>
            <CardDescription>
              ใช้แอป Authenticator (Google Authenticator, Microsoft Authenticator, 1Password ฯลฯ)
              — จำเป็นสำหรับการเปิดเผยข้อมูลลับระดับ HIGH/CRITICAL
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!dbUser.mfaEnabled && !enrollmentPending && (
              <form action={startMfaEnrollmentAction}>
                <Button type="submit">เริ่มลงทะเบียน MFA / Start enrollment</Button>
              </form>
            )}
            {enrollmentPending && (
              <div className="space-y-3">
                <p className="text-sm">1. สแกน QR ด้วยแอป Authenticator:</p>
                {/* QR served only while enrollment is pending; no-store */}
                <img src="/api/me/mfa/qr" alt="TOTP QR" className="h-40 w-40 rounded-md border bg-white p-2" />
                <form action={confirmMfaEnrollmentAction} className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="code">2. กรอกรหัส 6 หลักเพื่อยืนยัน</Label>
                    <Input id="code" name="code" inputMode="numeric" minLength={6} maxLength={6} required className="w-32 font-mono" />
                  </div>
                  <Button type="submit">ยืนยัน / Verify</Button>
                </form>
              </div>
            )}
            {dbUser.mfaEnabled && (
              <form action={disableMfaAction} className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor="code">กรอกรหัส MFA เพื่อปิดใช้งาน</Label>
                  <Input id="code" name="code" inputMode="numeric" minLength={6} maxLength={6} required className="w-32 font-mono" />
                </div>
                <ConfirmButton variant="destructive" confirmText="ปิดใช้งาน MFA? ความปลอดภัยของบัญชีจะลดลง">
                  ปิด MFA / Disable
                </ConfirmButton>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Passkeys (WebAuthn)
              {passkeys.length > 0
                ? <Badge variant="success">{passkeys.length} อุปกรณ์</Badge>
                : <Badge variant="secondary">ยังไม่มี / None</Badge>}
            </CardTitle>
            <CardDescription>
              ใช้ Touch ID / Windows Hello / Security Key เป็นอีกทางเลือกแทนรหัส TOTP
              สำหรับการเปิดเผยข้อมูลลับระดับ HIGH/CRITICAL
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {passkeys.map((p) => {
              const del = deletePasskeyAction.bind(null, p.id);
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name ?? "Passkey"}</p>
                    <p className="text-xs text-muted-foreground">
                      เพิ่มเมื่อ {formatDateTime(p.createdAt)}
                      {p.lastUsedAt && ` · ใช้ล่าสุด ${formatDateTime(p.lastUsedAt)}`}
                      {p.backedUp && " · ซิงก์ข้ามอุปกรณ์"}
                    </p>
                  </div>
                  <form action={del}>
                    <ConfirmButton variant="outline" size="sm" confirmText="ลบ Passkey นี้? / Remove this passkey?">
                      ลบ / Remove
                    </ConfirmButton>
                  </form>
                </div>
              );
            })}
            <AddPasskeyButton />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session ที่ใช้งานอยู่ / Active Sessions</CardTitle>
            <CardDescription>
              Session หมดอายุอัตโนมัติภายใน 8 ชั่วโมง (absolute timeout)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessions.map((s) => {
              const revoke = revokeSessionAction.bind(null, s.id);
              return (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{s.userAgent ?? "ไม่ทราบอุปกรณ์ / Unknown device"}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.ip ?? "-"} · ใช้งานล่าสุด {formatDateTime(s.lastSeenAt)}
                    </p>
                  </div>
                  <form action={revoke}>
                    <Button variant="outline" size="sm">เพิกถอน / Revoke</Button>
                  </form>
                </div>
              );
            })}
            <form action={revokeAllSessionsAction}>
              <ConfirmButton variant="destructive" size="sm" confirmText="ออกจากระบบทุกอุปกรณ์? / Sign out everywhere?">
                ออกจากระบบทุกอุปกรณ์ / Logout all sessions
              </ConfirmButton>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
