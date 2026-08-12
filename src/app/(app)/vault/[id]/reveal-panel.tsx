"use client";

/**
 * Reveal / Copy panel. Fetches decrypted values from /api/vault/:id/reveal
 * only on explicit user action; auto-hides after 30s; clears clipboard after
 * 30s where the browser allows; clears all plaintext from state on hide.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Eye, EyeOff, Copy, ShieldAlert, Check, Loader2, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const AUTO_HIDE_SECONDS = 30;

const FIELD_LABELS: Record<string, string> = {
  password: "รหัสผ่าน / Password",
  apiKey: "API Key",
  token: "Token",
  sshPrivateKey: "SSH Private Key",
  sshPublicKey: "SSH Public Key",
  certificate: "Certificate",
  extra: "อื่น ๆ / Extra",
};

type Secret = Record<string, string>;

export function RevealPanel({
  itemId,
  classification,
  requireMfa,
  requireApproval,
  canReveal,
  canCopy,
  hasPasskey = false,
}: {
  itemId: string;
  classification: string;
  requireMfa: boolean;
  requireApproval: boolean;
  canReveal: boolean;
  canCopy: boolean;
  hasPasskey?: boolean;
}) {
  const [secret, setSecret] = useState<Secret | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [needMfa, setNeedMfa] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const pendingAction = useRef<"REVEAL_SECRET" | "COPY_SECRET">("REVEAL_SECRET");
  const hideTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearSecret = useCallback(() => {
    setSecret(null);
    setCountdown(0);
    if (hideTimer.current) clearInterval(hideTimer.current);
  }, []);

  useEffect(() => () => clearSecret(), [clearSecret]);

  const startCountdown = useCallback(() => {
    setCountdown(AUTO_HIDE_SECONDS);
    if (hideTimer.current) clearInterval(hideTimer.current);
    hideTimer.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearSecret();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, [clearSecret]);

  const doFetch = useCallback(
    async (
      action: "REVEAL_SECRET" | "COPY_SECRET",
      code?: string,
      webauthn?: unknown
    ) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/vault/${itemId}/reveal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, mfaCode: code || undefined, webauthn }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          if (res.status === 403 && (requireMfa || data.error === "forbidden") && !code) {
            setNeedMfa(true);
            return null;
          }
          setError(
            data.error === "forbidden"
              ? requireApproval
                ? "ต้องได้รับอนุมัติก่อนเข้าถึง (Emergency/Approval required) หรือรหัส MFA ไม่ถูกต้อง"
                : "คุณไม่มีสิทธิ์ หรือรหัส MFA ไม่ถูกต้อง / Access denied or invalid MFA"
              : "เกิดข้อผิดพลาด / Request failed"
          );
          return null;
        }
        const data = (await res.json()) as { secret: Secret };
        return data.secret;
      } finally {
        setLoading(false);
      }
    },
    [itemId, requireMfa, requireApproval]
  );

  const reveal = useCallback(
    async (code?: string, webauthn?: unknown) => {
      const s = await doFetch("REVEAL_SECRET", code, webauthn);
      if (s) {
        setNeedMfa(false);
        setMfaCode("");
        setSecret(s);
        startCountdown();
      }
    },
    [doFetch, startCountdown]
  );

  const revealWithPasskey = useCallback(async () => {
    setError(null);
    try {
      const optRes = await fetch("/api/me/webauthn/auth-options", { method: "POST" });
      if (!optRes.ok) throw new Error("options");
      const optionsJSON = await optRes.json();
      const assertion = await startAuthentication({ optionsJSON });
      await reveal(undefined, assertion);
    } catch (e) {
      const err = e as { name?: string };
      setError(
        err.name === "NotAllowedError"
          ? "ยกเลิกหรือหมดเวลา / Cancelled or timed out"
          : "ยืนยันด้วย Passkey ไม่สำเร็จ / Passkey verification failed"
      );
    }
  }, [reveal]);

  const copyField = useCallback(
    async (field: string, code?: string) => {
      // Use already-revealed value if present; otherwise fetch with COPY audit
      let value = secret?.[field];
      if (!value) {
        const s = await doFetch("COPY_SECRET", code);
        if (!s) return;
        value = s[field];
      }
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        setCopied(field);
        setTimeout(() => setCopied(null), 2000);
        // Best-effort clipboard clear after 30s (browser must keep focus)
        setTimeout(() => {
          navigator.clipboard.writeText("").catch(() => {});
        }, AUTO_HIDE_SECONDS * 1000);
      } catch {
        setError("เบราว์เซอร์ไม่อนุญาตให้คัดลอก / Clipboard unavailable");
      }
    },
    [secret, doFetch]
  );

  const onRevealClick = () => {
    pendingAction.current = "REVEAL_SECRET";
    if (classification === "CRITICAL" || classification === "HIGH") {
      setConfirmOpen(true);
    } else {
      void reveal();
    }
  };

  if (!canReveal && !canCopy) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณมีสิทธิ์ดูข้อมูลทั่วไปเท่านั้น ไม่สามารถเปิดเผยรหัสผ่านได้ / View-only access
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {canReveal && !secret && (
          <Button onClick={onRevealClick} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
            เปิดเผย / Reveal
          </Button>
        )}
        {secret && (
          <Button variant="secondary" onClick={clearSecret}>
            <EyeOff className="h-4 w-4" /> ซ่อน / Hide ({countdown}s)
          </Button>
        )}
        {canCopy && !secret && (
          <Button variant="outline" onClick={() => copyField("password")} disabled={loading}>
            <Copy className="h-4 w-4" /> คัดลอกรหัสผ่าน / Copy
          </Button>
        )}
      </div>

      {needMfa && (
        <form
          className="flex items-end gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (pendingAction.current === "COPY_SECRET") void copyField("password", mfaCode);
            else void reveal(mfaCode);
          }}
        >
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium">
              <ShieldAlert className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
              ต้องยืนยัน MFA / MFA required
            </label>
            <Input
              inputMode="numeric"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="max-w-[10rem] font-mono"
            />
          </div>
          <Button type="submit" disabled={mfaCode.length !== 6 || loading}>
            ยืนยัน / Verify
          </Button>
          {hasPasskey && (
            <Button type="button" variant="outline" disabled={loading} onClick={revealWithPasskey}>
              <Fingerprint className="h-4 w-4" /> ใช้ Passkey
            </Button>
          )}
        </form>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {secret && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
          {Object.entries(secret).map(([field, value]) => (
            <div key={field}>
              <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                {FIELD_LABELS[field] ?? field}
              </p>
              <div className="flex items-center gap-2">
                <code className="max-h-32 flex-1 overflow-auto whitespace-pre-wrap break-all rounded bg-card px-2 py-1.5 font-mono text-sm">
                  {value}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyField(field)}
                  title="คัดลอก / Copy"
                >
                  {copied === field ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            จะซ่อนอัตโนมัติใน {countdown} วินาที · การเข้าถึงถูกบันทึกใน Audit Log
          </p>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              ยืนยันการเปิดเผยข้อมูลลับ
            </DialogTitle>
            <DialogDescription>
              คุณกำลังเปิดเผยข้อมูลลับระดับ {classification} — การกระทำนี้จะถูกบันทึกใน
              Audit Log พร้อม IP และเวลา / You are revealing a {classification}-classified
              secret. This action is audited.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              ยกเลิก / Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                void reveal();
              }}
            >
              ยืนยัน / Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
