"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Boxes, ShieldCheck } from "lucide-react";
import styles from "./login.module.css";

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
    params.get("error")
      ? ERROR_MESSAGES[params.get("error")!] ?? "เข้าสู่ระบบไม่สำเร็จ / Sign-in failed"
      : null
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
    <>
      <div className={styles.rays} aria-hidden />
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <Boxes size={28} />
          </div>
          <div className={styles.heading}>ITBox</div>
          <div className={styles.subheading}>
            ระบบบริหารจัดการไอทีองค์กร · Enterprise IT Management
          </div>
        </div>

        <input
          className={styles.input}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="อีเมล / E-mail"
          id="email"
          aria-label="Email"
        />
        <input
          className={styles.input}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="รหัสผ่าน / Password"
          id="password"
          aria-label="Password"
        />

        {needMfa && (
          <>
            <span className={styles.mfaLabel}>
              <ShieldCheck size={14} /> รหัส MFA / MFA code
            </span>
            <input
              className={styles.input}
              inputMode="numeric"
              maxLength={6}
              required
              value={totp}
              onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              id="totp"
              aria-label="MFA code"
            />
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <button className={styles.loginButton} type="submit" disabled={loading}>
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ / SIGN IN"}
        </button>

        <div className={styles.socialContainer}>
          <span className={styles.socialTitle}>
            หรือเข้าสู่ระบบด้วย / Or sign in with
          </span>
          <div className={styles.socialButtons}>
            <button
              type="button"
              className={styles.socialButton}
              title="Google"
              aria-label="Sign in with Google"
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" />
              </svg>
            </button>
            {process.env.NEXT_PUBLIC_AUTH_ENTRA === "1" && (
              <button
                type="button"
                className={styles.socialButton}
                title="Microsoft"
                aria-label="Sign in with Microsoft"
                onClick={() => signIn("microsoft-entra-id", { callbackUrl: "/dashboard" })}
              >
                <svg width="20" height="20" viewBox="0 0 23 23" aria-hidden>
                  <rect x="1" y="1" width="10" height="10" fill="#f25022" />
                  <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
                  <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
                  <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <span className={styles.agreement}>
          การเข้าสู่ระบบถือว่ายอมรับนโยบายความปลอดภัยและ PDPA ขององค์กร
        </span>
      </form>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className={styles.page}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
