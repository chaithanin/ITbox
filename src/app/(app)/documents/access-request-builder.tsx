"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SystemDef { key: string; label: string; section: string; levels: string[] }
interface Props {
  submitAction: (fd: FormData) => void | Promise<void>;
  systems: SystemDef[];
  departments: { name: string }[];
  jobLevels: { value: string; th: string }[];
  accessFormUrl: string;
}
type Status = "REQUIRED" | "OPTIONAL" | "RESTRICTED" | "NOT_ALLOWED";
const keyOf = (sys: string, lvl: string) => `${sys}||${lvl}`;
const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export function AccessRequestBuilder({ submitAction, systems, departments, jobLevels, accessFormUrl }: Props) {
  const [f, setF] = useState({ refNo: "", employeeCode: "", nameTh: "", nameEn: "", phone: "", email: "", company: "", department: "", position: "", jobLevel: "" });
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [expiryDate, setExpiryDate] = useState(plusDays(365));
  const [justification, setJustification] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [statusMap, setStatusMap] = useState<Record<string, Status>>({});
  const [chain, setChain] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const [looking, setLooking] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const sysMap = useMemo(() => new Map(systems.map((s) => [s.key, s])), [systems]);
  const sections = useMemo(() => {
    const m = new Map<string, SystemDef[]>();
    for (const s of systems) { if (!m.has(s.section)) m.set(s.section, []); m.get(s.section)!.push(s); }
    return [...m.entries()];
  }, [systems]);

  async function lookupStaff() {
    const code = f.employeeCode.trim();
    if (!code) return;
    setLooking(true);
    try {
      const r = await fetch(`/api/doc-forms/lookup?code=${encodeURIComponent(code)}`);
      const d = await r.json();
      if (d.found) setF((p) => ({ ...p, nameTh: p.nameTh || d.name || "", nameEn: p.nameEn || d.name || "", department: p.department || d.department || "", position: p.position || d.position || "", phone: p.phone || d.phone || "", email: p.email || d.email || "" }));
    } catch { /* ignore */ } finally { setLooking(false); }
  }

  // Load the default profile when dept + (position or level) are known.
  async function loadProfile() {
    if (!f.department || (!f.position && !f.jobLevel)) return;
    const qs = new URLSearchParams({ company: f.company, department: f.department, position: f.position, jobLevel: f.jobLevel });
    try {
      const r = await fetch(`/api/doc-forms/access-profile?${qs}`);
      const d = await r.json();
      if (!d.matched) { setMsg({ kind: "warn", text: "ยังไม่ได้กำหนดสิทธิ์มาตรฐานสำหรับตำแหน่งนี้ / No default permission profile configured." }); setStatusMap({}); setChain(d.approvalChain ?? []); return; }
      const sm: Record<string, Status> = {};
      const nextSel: Record<string, boolean> = { ...sel };
      for (const it of d.items as { system: string; permissionLevel: string; defaultStatus: Status }[]) {
        const k = keyOf(it.system, it.permissionLevel);
        sm[k] = it.defaultStatus;
        if (it.defaultStatus === "REQUIRED") nextSel[k] = true;
        if (it.defaultStatus === "NOT_ALLOWED") nextSel[k] = false;
      }
      setStatusMap(sm); setSel(nextSel); setChain(d.approvalChain ?? []);
      setMsg({ kind: "ok", text: "โหลดสิทธิ์มาตรฐานตามตำแหน่งเรียบร้อยแล้ว / Default permission profile applied" });
    } catch { /* ignore */ }
  }
  const loadRef = useRef(loadProfile);
  loadRef.current = loadProfile;
  useEffect(() => { loadRef.current(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [f.department, f.position, f.jobLevel, f.company]);

  // Derived: selected items + whether additional/restricted present.
  const items = useMemo(() => {
    const out: { system: string; systemLabel: string; permissionLevel: string; source: "DEFAULT" | "ADDITIONAL" | "RESTRICTED"; justification?: string }[] = [];
    for (const [k, on] of Object.entries(sel)) {
      if (!on) continue;
      const [system, permissionLevel] = k.split("||");
      const st = statusMap[k];
      const source = st === "REQUIRED" ? "DEFAULT" : st === "RESTRICTED" ? "RESTRICTED" : "ADDITIONAL";
      out.push({ system, systemLabel: sysMap.get(system)?.label ?? system, permissionLevel, source });
    }
    return out;
  }, [sel, statusMap, sysMap]);
  const hasExtra = items.some((i) => i.source !== "DEFAULT");
  const itemsWithJust = useMemo(() => items.map((i) => (i.source !== "DEFAULT" ? { ...i, justification } : i)), [items, justification]);

  function badge(status: Status | undefined, checked: boolean) {
    if (status === "NOT_ALLOWED") return <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Not allowed</span>;
    if (!checked) return null;
    if (status === "REQUIRED") return <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">Default</span>;
    if (status === "RESTRICTED") return <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-400">Restricted</span>;
    return <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">Additional</span>;
  }

  const hidden = (
    <>
      {(["refNo", "employeeCode", "nameTh", "nameEn", "phone", "email", "company", "position"] as const).map((k) => <input key={k} type="hidden" name={k} value={f[k]} />)}
      <input type="hidden" name="department2" value={f.department} />
      <input type="hidden" name="jobLevel" value={f.jobLevel} />
      <input type="hidden" name="effectiveDate" value={effectiveDate} />
      <input type="hidden" name="expiryDate" value={expiryDate} />
      <input type="hidden" name="businessJustification" value={justification} />
      <input type="hidden" name="approvalChain" value={chain.join("|")} />
      <input type="hidden" name="itemsJson" value={JSON.stringify(itemsWithJust)} />
    </>
  );

  return (
    <form className="space-y-4">
      {hidden}
      {/* Requester + access profile */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">ผู้ขอสิทธิ์ / Requester &amp; Access Profile</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>รหัสพนักงาน / Staff ID</Label>
            <div className="relative mt-1">
              <Input value={f.employeeCode} onChange={(e) => set("employeeCode", e.target.value)} onBlur={lookupStaff} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookupStaff(); } }} placeholder="กรอกแล้วกด Enter" />
              {looking && <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>
          </div>
          <div><Label>Ref No</Label><Input value={f.refNo} onChange={(e) => set("refNo", e.target.value)} className="mt-1" /></div>
          <div><Label>ชื่อ (TH)</Label><Input value={f.nameTh} onChange={(e) => set("nameTh", e.target.value)} className="mt-1" /></div>
          <div><Label>ชื่อ (EN)</Label><Input value={f.nameEn} onChange={(e) => set("nameEn", e.target.value)} className="mt-1" /></div>
          <div><Label>บริษัท / Company</Label><Input value={f.company} onChange={(e) => set("company", e.target.value)} className="mt-1" /></div>
          <div>
            <Label>แผนก / Department</Label>
            <Input value={f.department} onChange={(e) => set("department", e.target.value)} list="dept-list" className="mt-1" />
            <datalist id="dept-list">{departments.map((d) => <option key={d.name} value={d.name} />)}</datalist>
          </div>
          <div><Label>ตำแหน่ง / Position</Label><Input value={f.position} onChange={(e) => set("position", e.target.value)} className="mt-1" /></div>
          <div>
            <Label>ระดับ / Job Level</Label>
            <Select value={f.jobLevel} onChange={(e) => set("jobLevel", e.target.value)} className="mt-1">
              <option value="">— เลือก / Select —</option>
              {jobLevels.map((l) => <option key={l.value} value={l.value}>{l.th}</option>)}
            </Select>
          </div>
          <div><Label>โทร / Phone</Label><Input value={f.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1" /></div>
          <div><Label>อีเมล / Email</Label><Input value={f.email} onChange={(e) => set("email", e.target.value)} className="mt-1" /></div>
        </CardContent>
      </Card>

      {msg && (
        <p className={`rounded-md border p-2 text-sm ${msg.kind === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
          <ShieldCheck className="mr-1 inline h-4 w-4" />{msg.text}
        </p>
      )}

      {/* Permissions grouped by section */}
      {sections.map(([title, sys]) => (
        <Card key={title}>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {sys.map((s) => (
              <div key={s.key} className="border-b pb-2 last:border-0">
                <p className="text-sm font-medium">{s.label}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {s.levels.map((lvl) => {
                    const k = keyOf(s.key, lvl);
                    const st = statusMap[k];
                    const disabled = st === "NOT_ALLOWED";
                    const checked = !!sel[k];
                    return (
                      <label key={lvl} className={`flex items-center gap-1.5 text-sm ${disabled ? "opacity-50" : ""}`}>
                        <input type="checkbox" disabled={disabled} checked={checked} onChange={(e) => setSel((p) => ({ ...p, [k]: e.target.checked }))} className="h-4 w-4" />
                        {lvl}
                        {badge(st, checked)}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Justification + validity */}
      <Card>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-2">
          <div>
            <Label>วันที่มีผล / Effective Date</Label>
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>วันหมดอายุ / Expiry Date</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="mt-1" />
            <div className="mt-1 flex flex-wrap gap-1">
              {[{ n: 1, l: "1 วัน" }, { n: 7, l: "7 วัน" }, { n: 30, l: "30 วัน" }, { n: 90, l: "90 วัน" }, { n: 365, l: "1 ปี" }].map((o) => (
                <Button key={o.n} type="button" variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => setExpiryDate(plusDays(o.n))}>{o.l}</Button>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label>เหตุผลในการขอสิทธิ์เพิ่มเติม / Business Justification {hasExtra && <span className="text-destructive">*</span>}</Label>
            <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={2} className="mt-1" placeholder={hasExtra ? "จำเป็นเมื่อขอสิทธิ์เพิ่ม/พิเศษ" : "ไม่บังคับ"} />
          </div>
        </CardContent>
      </Card>

      {chain.length > 0 && (
        <p className="rounded-md border bg-muted/40 p-3 text-sm">
          <span className="font-medium">สายการอนุมัติ / Required Approval:</span> {chain.join("  →  ")}
        </p>
      )}

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background/95 py-3">
        <Button type="submit" variant="outline" formAction="/api/doc-forms/access-request/pdf" formMethod="POST" formTarget="_blank">
          <Download className="h-4 w-4" /> สร้าง PDF / Generate PDF
        </Button>
        <Button type="submit" formAction={submitAction} disabled={hasExtra && !justification.trim()}>
          <Save className="h-4 w-4" /> ส่งคำขอ / Submit Request
        </Button>
      </div>
    </form>
  );
}
