import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileText } from "lucide-react";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getForm, type OptionGroup, type Section, type TableSpec } from "@/lib/documents/forms";
import { StaffIdField } from "../staff-id-field";

const ORIGINAL = (slug: string) => `/forms/${slug}-original.pdf`;

function GroupField({ g }: { g: OptionGroup }) {
  return (
    <div className="space-y-1.5 border-b pb-2 last:border-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {g.th && <p className="text-sm font-medium">{g.th}</p>}
        {g.levels?.map((lv) => (
          <label key={lv.value} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" name={`${g.name}__level`} value={lv.value} className="h-3.5 w-3.5" />
            {lv.th}
          </label>
        ))}
      </div>
      {g.options.length > 0 && (
        <div className={g.inline ? "flex flex-wrap gap-x-4 gap-y-1" : "grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3"}>
          {g.options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input type={g.multi ? "checkbox" : "radio"} name={g.name} value={o.value} className="h-4 w-4" />
              {o.th}
            </label>
          ))}
        </div>
      )}
      {g.matrix && g.matrix.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
          {g.matrix.map((code) => (
            <label key={code} className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <input type="checkbox" name={`${g.name}__mod`} value={code} className="h-3 w-3" />
              {code}
            </label>
          ))}
        </div>
      )}
      {g.other && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-sm text-muted-foreground">อื่น ๆ / Other:</span>
          <Input name={`${g.name}__other`} className="h-8 max-w-xs" />
        </div>
      )}
    </div>
  );
}

function TableField({ t }: { t: TableSpec }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{t.th}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              {t.columns.map((c) => (
                <th key={c.key} className="border px-2 py-1 text-left text-xs font-medium">{c.th}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: t.rows }).map((_, r) => (
              <tr key={r}>
                {t.columns.map((c) => (
                  <td key={c.key} className="border p-0">
                    <input name={`${t.name}.${r}.${c.key}`} className="w-full bg-transparent px-2 py-1 text-sm outline-none focus:bg-accent/40" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionBlock({ s }: { s: Section }) {
  return (
    <Card>
      {s.title && <CardHeader className="pb-3"><CardTitle className="text-sm">{s.title}</CardTitle></CardHeader>}
      <CardContent className="space-y-3">
        {s.fields?.map((f) => (
          <div key={f.name} className={f.half ? "inline-block w-full sm:w-[calc(50%-0.5rem)] sm:pr-2 align-top" : ""}>
            {f.name === "employeeCode" ? (
              <StaffIdField name={f.name} label={f.th} />
            ) : (
            <>
            <Label htmlFor={f.name}>{f.th}</Label>
            {f.type === "textarea" ? (
              <Textarea id={f.name} name={f.name} rows={2} className="mt-1" />
            ) : (
              <Input id={f.name} name={f.name} type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text"} className="mt-1" />
            )}
            </>
            )}
          </div>
        ))}
        {s.groups?.map((g) => <GroupField key={g.name} g={g} />)}
        {s.tables?.map((t) => <TableField key={t.name} t={t} />)}
        {s.note && <p className="rounded-md border bg-muted/40 p-2 text-xs text-muted-foreground">{s.note}</p>}
      </CardContent>
    </Card>
  );
}

export default async function DocumentFillPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireUser();
  const { slug } = await params;
  const form = getForm(slug);
  if (!form) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link href="/documents"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link>
      </Button>
      <PageHeader title={form.titleTh} description={form.titleEn}>
        <Button variant="outline" asChild>
          <a href={ORIGINAL(slug)} target="_blank" rel="noopener noreferrer"><Download className="h-4 w-4" /> ต้นฉบับ / Original</a>
        </Button>
      </PageHeader>

      {form.referenceOnly ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            เอกสารอ้างอิง — ดาวน์โหลดต้นฉบับด้านบน
          </CardContent>
        </Card>
      ) : (
        // Native POST form: opens the generated PDF in a new tab.
        <form action={`/api/doc-forms/${slug}/pdf`} method="POST" target="_blank" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <Label htmlFor="refNo">Ref No</Label>
              <Input id="refNo" name="refNo" className="mt-1 max-w-xs" placeholder="เลขที่เอกสาร (ถ้ามี)" />
            </CardContent>
          </Card>

          {form.topGroups && form.topGroups.length > 0 && (
            <Card>
              <CardContent className="space-y-3 pt-4">
                {form.topGroups.map((g) => <GroupField key={g.name} g={g} />)}
              </CardContent>
            </Card>
          )}

          {form.sections.map((s, i) => <SectionBlock key={i} s={s} />)}

          {form.adminSection && <SectionBlock s={form.adminSection} />}

          {(() => {
            const sigCount = (form.requesterSignatures?.length ?? 0) + (form.adminSignatures?.length ?? 0);
            return sigCount > 0 ? (
              <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                <FileText className="mr-1 inline h-3.5 w-3.5" />
                ช่องลงนาม ({sigCount} ช่อง) จะถูกพิมพ์ในไฟล์ PDF ให้เซ็นบนกระดาษ
              </p>
            ) : null;
          })()}

          <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-3">
            <Button type="submit"><Download className="h-4 w-4" /> สร้าง PDF / Generate PDF</Button>
          </div>
        </form>
      )}
    </div>
  );
}
