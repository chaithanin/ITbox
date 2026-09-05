import Link from "next/link";
import { Download, FileText, PencilLine } from "lucide-react";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FORMS } from "@/lib/documents/forms";

const CATEGORY_LABEL: Record<string, string> = {
  request: "แบบฟอร์มคำขอ / Request forms",
  record: "แบบฟอร์มบันทึก / Record forms",
  reference: "เอกสารอ้างอิง / Reference documents",
};

export default async function DocumentsPage() {
  await requireUser();
  const groups: ("request" | "record" | "reference")[] = ["request", "record", "reference"];

  return (
    <div>
      <PageHeader
        title="เอกสาร / Documents"
        description="แบบฟอร์ม IT — กรอกข้อมูลในเว็บแล้วสร้าง PDF หรือดาวน์โหลดต้นฉบับ"
      />
      <div className="space-y-6">
        {groups.map((cat) => {
          const items = FORMS.filter((f) => f.category === cat);
          if (items.length === 0) return null;
          return (
            <section key={cat}>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{CATEGORY_LABEL[cat]}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((f) => (
                  <Card key={f.slug} className="flex flex-col">
                    <CardContent className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                        <div>
                          <p className="text-sm font-medium leading-snug">{f.titleTh}</p>
                          <p className="text-xs text-muted-foreground">{f.titleEn}</p>
                        </div>
                      </div>
                      <p className="flex-1 text-xs text-muted-foreground">{f.descTh}</p>
                      <div className="flex flex-wrap gap-2">
                        {!f.referenceOnly && (
                          <Button size="sm" asChild>
                            <Link href={`/documents/${f.slug}`}><PencilLine className="h-4 w-4" /> กรอก / Fill</Link>
                          </Button>
                        )}
                        <Button size="sm" variant="outline" asChild>
                          <a href={`/forms/${f.slug}-original.pdf`} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4" /> ต้นฉบับ
                          </a>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
