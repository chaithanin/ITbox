"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Copy, Download, Save, RotateCcw, Plus, Trash2, ArrowUp, ArrowDown, Code, Check, Search, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  renderSignatureHtml, safeUrl, DEFAULT_WEBSITE, DEFAULT_ADDRESS,
  type SignatureData, type TemplateConfig, type CompanyLink,
} from "@/lib/signature";
import { saveSignatureAction, resetSignatureAction } from "./actions";

export interface TemplateOption {
  id: string;
  name: string;
  config: TemplateConfig;
}

type FormState = SignatureData & { templateId: string | null };

export function SignatureEditor({
  initial,
  config,
  templates,
}: {
  initial: FormState;
  config: TemplateConfig;
  templates: TemplateOption[];
}) {
  const [form, setForm] = useState<FormState>({ ...initial, companyLinks: initial.companyLinks ?? [] });
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);

  const activeConfig = useMemo(() => {
    const t = templates.find((t) => t.id === form.templateId);
    return t?.config ?? config;
  }, [form.templateId, templates, config]);

  const html = useMemo(() => renderSignatureHtml(form, activeConfig), [form, activeConfig]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const links = form.companyLinks ?? [];
  const setLinks = (next: CompanyLink[]) => set("companyLinks", next);

  // ----- employee directory search (auto-fill from a staff record) -----
  interface DirEntry {
    id: string;
    employeeCode: string;
    fullName: string;
    position: string;
    department: string;
    officePhone: string;
    email: string;
  }
  const [dirQuery, setDirQuery] = useState("");
  const [dirResults, setDirResults] = useState<DirEntry[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirOpen, setDirOpen] = useState(false);
  const dirBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = dirQuery.trim();
    if (q.length < 2) {
      setDirResults([]);
      setDirLoading(false);
      return;
    }
    setDirLoading(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/employees/directory?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const body = (await res.json().catch(() => null)) as { data?: DirEntry[] } | null;
        setDirResults(res.ok && body?.data ? body.data : []);
        setDirOpen(true);
      } catch {
        /* aborted or network error — ignore */
      } finally {
        setDirLoading(false);
      }
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [dirQuery]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dirBoxRef.current && !dirBoxRef.current.contains(e.target as Node)) setDirOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pickEmployee(e: DirEntry) {
    setForm((f) => ({
      ...f,
      fullName: e.fullName || f.fullName,
      position: e.position,
      department: e.department,
      officePhone: e.officePhone,
      email: e.email,
      website: f.website?.trim() ? f.website : DEFAULT_WEBSITE,
      address: f.address?.trim() ? f.address : DEFAULT_ADDRESS,
    }));
    setDirQuery("");
    setDirResults([]);
    setDirOpen(false);
    setMsg({ text: `ดึงข้อมูลของ ${e.fullName} แล้ว / Filled from ${e.fullName}` });
  }
  const addLink = () => setLinks([...links, { name: "", url: "" }]);
  const updateLink = (i: number, patch: Partial<CompanyLink>) =>
    setLinks(links.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i));
  const moveLink = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= links.length) return;
    const next = [...links];
    [next[i], next[j]] = [next[j], next[i]];
    setLinks(next);
  };

  async function copyRich() {
    try {
      const blobHtml = new Blob([html], { type: "text/html" });
      const blobText = new Blob([html], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": blobHtml, "text/plain": blobText }),
      ]);
      flash("copy-rich", "คัดลอกลายเซ็นแล้ว — ไปวางใน Outlook ได้เลย / Copied");
    } catch {
      setMsg({ text: "คัดลอกไม่สำเร็จ ลองใช้ปุ่ม Copy HTML / Copy failed", error: true });
    }
  }
  async function copySource() {
    try {
      await navigator.clipboard.writeText(html);
      flash("copy-src", "คัดลอก HTML แล้ว / HTML copied");
    } catch {
      setMsg({ text: "คัดลอกไม่สำเร็จ / Copy failed", error: true });
    }
  }
  function download() {
    const full = `<!doctype html><html><head><meta charset="utf-8"><title>Email Signature</title></head><body>${html}</body></html>`;
    const url = URL.createObjectURL(new Blob([full], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "email-signature.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
  function flash(key: string, text: string) {
    setCopied(key);
    setMsg({ text });
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
  }

  function save() {
    // Client-side URL guard before hitting the server.
    if (form.website && !safeUrl(form.website)) return setMsg({ text: "Website URL ไม่ถูกต้อง", error: true });
    if (form.logoUrl && !safeUrl(form.logoUrl)) return setMsg({ text: "Logo URL ไม่ถูกต้อง", error: true });
    for (const l of links) if (l.name && !safeUrl(l.url)) return setMsg({ text: `URL ของ "${l.name}" ไม่ถูกต้อง`, error: true });
    startTransition(async () => {
      const res = await saveSignatureAction({
        templateId: form.templateId,
        fullName: form.fullName,
        position: form.position ?? "",
        department: form.department ?? "",
        mobilePhone: form.mobilePhone ?? "",
        officePhone: form.officePhone ?? "",
        extension: form.extension ?? "",
        email: form.email ?? "",
        website: form.website ?? "",
        address: form.address ?? "",
        logoUrl: form.logoUrl ?? "",
        companyLinks: links
          .filter((l) => l.name.trim() && l.url.trim())
          .map((l) => ({ name: l.name, url: l.url, icon: l.icon ?? "" })),
      });
      setMsg(res.ok ? { text: "บันทึกลายเซ็นแล้ว / Saved" } : { text: res.error, error: true });
    });
  }
  function reset() {
    if (!confirm("คืนค่าเริ่มต้นจากโปรไฟล์? การแก้ไขที่ยังไม่บันทึกจะหายไป")) return;
    startTransition(async () => {
      await resetSignatureAction();
      window.location.reload();
    });
  }

  const field = (
    label: string,
    key: keyof FormState,
    opts: { type?: string; placeholder?: string; textarea?: boolean } = {}
  ) => (
    <div>
      <Label htmlFor={key as string}>{label}</Label>
      {opts.textarea ? (
        <Textarea
          id={key as string}
          className="mt-1"
          rows={2}
          value={(form[key] as string) ?? ""}
          placeholder={opts.placeholder}
          onChange={(e) => set(key, e.target.value as FormState[typeof key])}
        />
      ) : (
        <Input
          id={key as string}
          type={opts.type ?? "text"}
          className="mt-1"
          value={(form[key] as string) ?? ""}
          placeholder={opts.placeholder}
          onChange={(e) => set(key, e.target.value as FormState[typeof key])}
        />
      )}
    </div>
  );

  return (
    <div>
      {msg && (
        <p className={`mb-4 rounded-md px-3 py-2 text-sm ${msg.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {msg.text}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* LEFT: form */}
        <div className="space-y-4">
          {templates.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">เทมเพลต / Template</CardTitle></CardHeader>
              <CardContent>
                <Select
                  value={form.templateId ?? ""}
                  onChange={(e) => set("templateId", e.target.value || null)}
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">ค้นหาพนักงาน / Find employee</CardTitle></CardHeader>
            <CardContent>
              <div ref={dirBoxRef} className="relative">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={dirQuery}
                    onChange={(e) => setDirQuery(e.target.value)}
                    onFocus={() => dirResults.length > 0 && setDirOpen(true)}
                    placeholder="พิมพ์ชื่อ / รหัส / ตำแหน่ง เพื่อดึงข้อมูลอัตโนมัติ…"
                    className="pl-9 pr-9"
                  />
                  {dirLoading && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                {dirOpen && (dirResults.length > 0 || (dirQuery.trim().length >= 2 && !dirLoading)) && (
                  <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-card shadow-lg">
                    {dirResults.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">ไม่พบพนักงาน / No matches</p>
                    ) : (
                      dirResults.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => pickEmployee(e)}
                          className="flex w-full items-start gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-accent"
                        >
                          <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">{e.fullName}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[e.position, e.department].filter(Boolean).join(" · ") || e.employeeCode}
                            </span>
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                เลือกพนักงานเพื่อเติม ชื่อ ตำแหน่ง แผนก โทรออฟฟิศ อีเมล และเว็บไซต์ให้อัตโนมัติ /
                Pick a staff record to auto-fill name, position, department, office phone, email and website.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">ข้อมูลส่วนตัว / Personal</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {field("ชื่อ-นามสกุล / Full name", "fullName")}
              {field("ตำแหน่ง / Position", "position")}
              {field("แผนก / Department", "department")}
              {field("โลโก้ (URL) / Logo URL", "logoUrl", { placeholder: "https://.../logo.png" })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">ข้อมูลติดต่อ / Contact</CardTitle></CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {field("มือถือ / Mobile", "mobilePhone", { type: "tel" })}
              {field("โทรออฟฟิศ / Office phone", "officePhone", { type: "tel" })}
              {field("ต่อ / Extension", "extension")}
              {field("อีเมล / Email", "email", { type: "email" })}
              {field("เว็บไซต์ / Website", "website", { placeholder: "www.example.com" })}
              {field("ที่อยู่ / Address", "address", { textarea: true })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm">ลิงก์บริษัท / Company Links</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addLink}>
                <Plus className="h-4 w-4" /> เพิ่ม / Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {links.length === 0 && (
                <p className="text-xs text-muted-foreground">ยังไม่มีลิงก์ — กด “เพิ่ม” เพื่อสร้าง</p>
              )}
              {links.map((l, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                  <Input
                    className="h-8 min-w-[8rem] flex-1 text-xs"
                    placeholder="ชื่อบริษัท / Name"
                    value={l.name}
                    onChange={(e) => updateLink(i, { name: e.target.value })}
                  />
                  <Input
                    className="h-8 min-w-[10rem] flex-1 text-xs"
                    placeholder="https://example.com"
                    value={l.url}
                    onChange={(e) => updateLink(i, { url: e.target.value })}
                  />
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveLink(i, -1)} className="rounded p-1 hover:bg-accent" title="ขึ้น"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => moveLink(i, 1)} className="rounded p-1 hover:bg-accent" title="ลง"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => removeLink(i)} className="rounded p-1 text-destructive hover:bg-destructive/10" title="ลบ"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: preview + actions */}
        <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">ตัวอย่างสด / Live Preview</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border bg-white p-4">
                {/* renderSignatureHtml escapes all values; safe to inject. */}
                <div dangerouslySetInnerHTML={{ __html: html }} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" onClick={copyRich}>
                  {copied === "copy-rich" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  Copy Signature for Outlook
                </Button>
                <Button type="button" variant="outline" onClick={copySource}>
                  {copied === "copy-src" ? <Check className="h-4 w-4" /> : <Code className="h-4 w-4" />}
                  Copy HTML
                </Button>
                <Button type="button" variant="outline" onClick={download}>
                  <Download className="h-4 w-4" /> Download HTML
                </Button>
                <Button type="button" onClick={save} disabled={pending}>
                  <Save className="h-4 w-4" /> {pending ? "กำลังบันทึก..." : "Save"}
                </Button>
                <Button type="button" variant="outline" onClick={reset} disabled={pending}>
                  <RotateCcw className="h-4 w-4" /> Reset
                </Button>
              </div>

              <div className="mt-3">
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowSource((s) => !s)}>
                  {showSource ? "ซ่อน HTML" : "ดู HTML Source"}
                </button>
                {showSource && (
                  <pre className="mt-2 max-h-56 overflow-auto rounded-md border bg-muted/40 p-3 text-[11px] leading-relaxed">
                    {html}
                  </pre>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">วิธีใช้:</strong> กด “Copy Signature for Outlook” แล้วเปิด Outlook →
            Settings → Mail → Compose and Reply → Email Signature → วาง (Ctrl/Cmd+V)
          </div>
        </div>
      </div>
    </div>
  );
}
