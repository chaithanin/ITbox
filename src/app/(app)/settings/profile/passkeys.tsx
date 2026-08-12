"use client";

/** Passkey (WebAuthn) enrollment UI — used as an MFA factor for vault reveal. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddPasskeyButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const register = async () => {
    setLoading(true);
    setError(null);
    try {
      const optRes = await fetch("/api/me/webauthn/register-options", { method: "POST" });
      if (!optRes.ok) throw new Error("options");
      const optionsJSON = await optRes.json();
      const response = await startRegistration({ optionsJSON });
      const verifyRes = await fetch("/api/me/webauthn/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, name: name || undefined }),
      });
      if (!verifyRes.ok) throw new Error("verify");
      setName("");
      router.refresh();
    } catch (e) {
      const err = e as { name?: string };
      setError(
        err.name === "NotAllowedError"
          ? "ยกเลิกหรือหมดเวลา / Cancelled or timed out"
          : "ลงทะเบียน Passkey ไม่สำเร็จ (ต้องใช้ HTTPS หรือ localhost) / Registration failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ชื่ออุปกรณ์ เช่น MacBook / Device name"
          maxLength={100}
        />
        <Button onClick={register} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <Fingerprint className="h-4 w-4" />
          เพิ่ม Passkey
        </Button>
      </div>
      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
