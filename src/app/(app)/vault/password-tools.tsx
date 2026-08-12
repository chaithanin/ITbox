"use client";

/**
 * Client-side password generator + strength meter.
 * Generation happens entirely in the browser (window.crypto) — generated
 * passwords are never sent to the server until the user saves the form.
 */
import { useState } from "react";
import { RefreshCcw, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PRESETS: Record<string, { length: number; upper: boolean; lower: boolean; num: boolean; sym: boolean; exclSimilar: boolean }> = {
  weak: { length: 8, upper: true, lower: true, num: true, sym: false, exclSimilar: false },
  normal: { length: 12, upper: true, lower: true, num: true, sym: false, exclSimilar: false },
  strong: { length: 16, upper: true, lower: true, num: true, sym: true, exclSimilar: false },
  veryStrong: { length: 20, upper: true, lower: true, num: true, sym: true, exclSimilar: false },
  enterprise: { length: 24, upper: true, lower: true, num: true, sym: true, exclSimilar: true },
};

const SIMILAR = new Set("il1Lo0O");

function randInt(max: number): number {
  const arr = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / max) * max;
  let v: number;
  do {
    window.crypto.getRandomValues(arr);
    v = arr[0];
  } while (v >= limit);
  return v % max;
}

function generate(o: (typeof PRESETS)[string]): string {
  const pools: string[] = [];
  if (o.upper) pools.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  if (o.lower) pools.push("abcdefghijklmnopqrstuvwxyz");
  if (o.num) pools.push("0123456789");
  if (o.sym) pools.push("!@#$%^&*()-_=+[]{}<>?");
  const filtered = pools
    .map((p) => (o.exclSimilar ? [...p].filter((c) => !SIMILAR.has(c)).join("") : p))
    .filter((p) => p.length > 0);
  const all = filtered.join("");
  const chars: string[] = filtered.map((p) => p[randInt(p.length)]);
  while (chars.length < o.length) chars.push(all[randInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, o.length).join("");
}

export function strengthOf(pw: string): { label: string; labelTh: string; pct: number; color: string } {
  if (!pw) return { label: "—", labelTh: "—", pct: 0, color: "bg-muted" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;
  if (pw.length >= 20) score++;
  if (/[a-z]/.test(pw)) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  if (/^(.)\1+$/.test(pw)) score = 1;
  if (score <= 3) return { label: "Weak", labelTh: "อ่อน", pct: 25, color: "bg-red-500" };
  if (score <= 5) return { label: "Fair", labelTh: "พอใช้", pct: 50, color: "bg-amber-500" };
  if (score <= 7) return { label: "Strong", labelTh: "แข็งแรง", pct: 75, color: "bg-emerald-500" };
  return { label: "Very Strong", labelTh: "แข็งแรงมาก", pct: 100, color: "bg-emerald-600" };
}

export function PasswordField({
  name,
  defaultValue,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [preset, setPreset] = useState("veryStrong");
  const [show, setShow] = useState(false);
  const s = strengthOf(value);

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          name={name}
          type={show ? "text" : "password"}
          value={value}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          className="font-mono"
        />
        <Button type="button" variant="outline" size="icon" onClick={() => setShow(!show)} title="แสดง/ซ่อน">
          {show ? "🙈" : "👁"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="สร้างรหัสผ่าน / Generate"
          onClick={() => {
            setValue(generate(PRESETS[preset]));
            setShow(true);
          }}
        >
          <Wand2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <select
          className="h-7 rounded border bg-card px-1.5 text-xs"
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          aria-label="Generator preset"
        >
          <option value="weak">Weak (8)</option>
          <option value="normal">Normal (12)</option>
          <option value="strong">Strong (16)</option>
          <option value="veryStrong">Very Strong (20)</option>
          <option value="enterprise">Enterprise (24)</option>
        </select>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all", s.color)} style={{ width: `${s.pct}%` }} />
        </div>
        <span className="w-24 text-right text-xs text-muted-foreground">
          {s.labelTh} / {s.label}
        </span>
      </div>
    </div>
  );
}

export function RegenerateHint() {
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <RefreshCcw className="h-3 w-3" />
      รหัสผ่านถูกสร้างในเบราว์เซอร์ ไม่ถูกส่งไปที่เซิร์ฟเวอร์จนกว่าจะกดบันทึก
    </p>
  );
}
