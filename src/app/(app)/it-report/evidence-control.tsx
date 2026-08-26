"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, ImageIcon, FileText, X, Loader2 } from "lucide-react";

export type EvidenceItem = { id: string; name: string; contentType: string | null };

/**
 * Per-check evidence attachments: upload photos/screenshots/PDF and list them.
 * Uploads go to /api/it-report/checks/[id]/evidence; files are served from
 * /api/it-report/evidence/[id].
 */
export function EvidenceControl({
  checkId,
  items,
  canEdit,
}: {
  checkId: string;
  items: EvidenceItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, startBusy] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    const body = new FormData();
    for (const f of Array.from(files)) body.append("file", f);
    const res = await fetch(`/api/it-report/checks/${checkId}/evidence`, {
      method: "POST",
      body,
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j?.error === "FILE_TOO_LARGE" ? "ไฟล์ใหญ่เกิน 10MB" : j?.error === "UNSUPPORTED_FILE_TYPE" ? "ชนิดไฟล์ไม่รองรับ" : "อัปโหลดไม่สำเร็จ");
      return;
    }
    if (inputRef.current) inputRef.current.value = "";
    startBusy(() => router.refresh());
  }

  async function onDelete(id: string) {
    const res = await fetch(`/api/it-report/evidence/${id}`, { method: "DELETE" });
    if (res.ok) startBusy(() => router.refresh());
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      {items.map((ev) => {
        const isImage = (ev.contentType ?? "").startsWith("image/");
        return (
          <span
            key={ev.id}
            className="group inline-flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pl-1.5 pr-1 text-[11px]"
          >
            <a
              href={`/api/it-report/evidence/${ev.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              title={ev.name}
            >
              {isImage ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
              <span className="max-w-[120px] truncate">{ev.name}</span>
            </a>
            {canEdit && (
              <button
                type="button"
                onClick={() => onDelete(ev.id)}
                className="rounded-full p-0.5 text-muted-foreground opacity-60 hover:bg-red-500/10 hover:text-red-600 hover:opacity-100"
                title="ลบ / Remove"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}

      {canEdit && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
            แนบรูป
          </button>
        </>
      )}

      {items.length === 0 && !canEdit && (
        <span className="text-[11px] text-muted-foreground">—</span>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}
