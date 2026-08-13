import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { updateCaseType } from "../../../actions";

export const dynamic = "force-dynamic";

const ERR: Record<string, string> = {
  "invalid-input": "ข้อมูลไม่ถูกต้อง / Invalid input",
  "key-exists": "มี key นี้อยู่แล้ว / Key already exists",
};

export default async function EditCaseTypePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePermission("support:settings");
  const { id } = await params;
  const sp = await searchParams;

  const t = await prisma.caseType.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!t) notFound();

  const action = updateCaseType.bind(null, t!.id);

  return (
    <div>
      <PageHeader
        title={`แก้ไขประเภทเคส / Edit: ${t!.nameTh ?? t!.name}`}
        description={t!.isSystem ? "ประเภทของระบบ — เปลี่ยน key ไม่ได้ / System type — key locked" : `key: ${t!.key}`}
      >
        <Button asChild variant="outline">
          <Link href="/settings/support/types">← กลับ / Back</Link>
        </Button>
      </PageHeader>

      {sp.error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERR[sp.error] ?? sp.error}
        </div>
      )}

      <Card>
        <CardContent className="pt-5">
          <form action={action} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="key">Key</Label>
              <Input
                id="key"
                name="key"
                defaultValue={t!.key}
                readOnly={t!.isSystem}
                required
              />
              {t!.isSystem && (
                <p className="text-xs text-muted-foreground">key ของประเภทระบบเปลี่ยนไม่ได้</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="prefix">Prefix (2-4 ตัว)</Label>
              <Input id="prefix" name="prefix" defaultValue={t!.prefix} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nameTh">ชื่อ (ไทย) / Name TH</Label>
              <Input id="nameTh" name="nameTh" defaultValue={t!.nameTh ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="name">ชื่อ (อังกฤษ) / Name EN</Label>
              <Input id="name" name="name" defaultValue={t!.name} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sortOrder">ลำดับ / Sort</Label>
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                min={0}
                defaultValue={t!.sortOrder}
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="active"
                  defaultChecked={t!.active}
                  className="h-4 w-4 rounded border-input"
                />
                ใช้งาน / Active
              </label>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="description">คำอธิบาย / Description</Label>
              <Textarea id="description" name="description" rows={2} defaultValue={t!.description ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">บันทึก / Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
