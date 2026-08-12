"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { signIn } from "next-auth/react";
import { Boxes, KeyRound, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "อีเมลหรือรหัสผ่านไม่ถูกต้อง / Invalid email or password",
  ACCOUNT_LOCKED: "บัญชีถูกล็อกชั่วคราว กรุณาลองใหม่ภายหลัง / Account temporarily locked",
  ACCOUNT_DISABLED: "บัญชีถูกปิดใช้งาน / Account disabled",
  RATE_LIMITED: "พยายามเข้าสู่ระบบบ่อยเกินไป / Too many attempts",
  MFA_INVALID: "รหัส MFA ไม่ถูกต้อง / Invalid MFA code",
  AccessDenied: "บัญชีของคุณไม่มีสิทธิ์เข้าใช้งานระบบ / Your account is not provisioned",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needMfa, setNeedMfa] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") ? ERROR_MESSAGES[params.get("error")!] ?? "เข้าสู่ระบบไม่สำเร็จ / Sign-in failed" : null
  );
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      totp: totp || undefined,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      const code = (res as { code?: string }).code ?? res.error;
      if (code === "MFA_REQUIRED") {
        setNeedMfa(true);
        setError("กรุณากรอกรหัส MFA จากแอป Authenticator / Enter your MFA code");
      } else {
        setError(ERROR_MESSAGES[code] ?? "เข้าสู่ระบบไม่สำเร็จ / Sign-in failed");
      }
      return;
    }
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Boxes className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold">ITBox</h1>
        <p className="text-sm text-muted-foreground">
          ระบบบริหารจัดการไอทีองค์กร · Enterprise IT Management
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">อีเมล / Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">รหัสผ่าน / Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {needMfa && (
            <div className="space-y-1.5">
              <Label htmlFor="totp" className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                รหัส MFA / MFA code
              </Label>
              <Input
                id="totp"
                inputMode="numeric"
                maxLength={6}
                required
                value={totp}
                onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
              />
            </div>
          )}
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            <KeyRound className="h-4 w-4" />
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ / Sign in"}
          </Button>
        </form>
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          หรือ / or
          <div className="h-px flex-1 bg-border" />
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" />
          </svg>
          เข้าสู่ระบบด้วย Google
        </Button>
        {process.env.NEXT_PUBLIC_AUTH_ENTRA === "1" && (
          <Button
            variant="outline"
            className="mt-2 w-full"
            onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/dashboard" })}
          >
            <svg className="h-4 w-4" viewBox="0 0 23 23" aria-hidden>
              <rect x="1" y="1" width="10" height="10" fill="#f25022" />
              <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
              <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
              <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
            </svg>
            เข้าสู่ระบบด้วย Microsoft
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/10 p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
