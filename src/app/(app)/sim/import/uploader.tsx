"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Result { created: number; updated: number; failed: number; errors: { row: number; phoneNumber: string; error: string }[] }

export function SimUploader() {
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = ref.current?.files?.[0];
    if (!file) { setErr("กรุณาเลือกไฟล์ CSV/Excel"); return; }
    setLoading(true); setResult(null); setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/sim/import", { method: "POST", body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok) { setErr(body?.message ?? "นำเข้าล้มเหลว"); return; }
      setResult(body as Result);
    } catch { setErr("นำเข้าล้มเหลว ลองใหม่"); } finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-3">
        <input ref={ref} type="file" accept=".csv,.xlsx" disabled={loading}
          onChange={(e) => { setName(e.target.files?.[0]?.name ?? null); setResult(null); setErr(null); }}
          className="text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent" />
        <Button type="submit" disabled={loading || !name}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {loading ? "กำลังนำเข้า..." : "นำเข้า / Import"}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        คอลัมน์ที่รองรับ: <code>phoneNumber</code> (จำเป็น), <code>carrier</code> หรือ <code>provider</code> (เช่น GTG(AIS)), <code>accountName</code>, <code>holder</code>, <code>status</code> (in-use/unused), <code>simSerial</code>, <code>plan</code>, <code>monthlyFee</code>, <code>department</code>, <code>notes</code>
      </p>
      {err && <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{err}</p>}
      {result && (
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/30 p-4 text-sm">
            <p>สร้างใหม่ / Created: <span className="font-semibold text-primary">{result.created}</span></p>
            <p>อัปเดต / Updated: <span className="font-semibold text-primary">{result.updated}</span></p>
            <p>ข้าม / Failed: <span className={result.failed > 0 ? "font-semibold text-destructive" : "font-semibold"}>{result.failed}</span></p>
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-md border p-3 text-xs">
              {result.errors.slice(0, 50).map((e, i) => (<div key={i}>แถว {e.row} · {e.phoneNumber || "-"} · {e.error}</div>))}
            </div>
          )}
          <Button variant="outline" asChild><Link href="/sim">ไปที่รายการเบอร์ / Go to SIM list</Link></Button>
        </div>
      )}
    </div>
  );
}
