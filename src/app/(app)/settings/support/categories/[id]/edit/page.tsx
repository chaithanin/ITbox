import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { MessageBanner } from "../../../message-banner";
import { updateCategory } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function EditCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("support:settings");
  const { id } = await params;
  const sp = await searchParams;
  const [cat, cats, teams] = await Promise.all([
    prisma.caseCategory.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null } }),
    prisma.caseCategory.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, parentId: null, id: { not: id } },
      orderBy: { name: "asc" },
    }),
    prisma.supportTeam.findMany({ where: { organizationId: user.organizationId, deletedAt: null }, orderBy: { name: "asc" } }),
  ]);
  if (!cat) notFound();
  const action = updateCategory.bind(null, cat.id);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={`แก้ไขหมวดหมู่ / Edit: ${cat.nameTh ?? cat.name}`} />
      <MessageBanner error={sp.error} />
      <Card>
        <CardContent className="p-5">
          <form action={action} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="name">ชื่อ (EN)</Label>
              <Input id="name" name="name" required defaultValue={cat.name} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nameTh">ชื่อ (ไทย)</Label>
              <Input id="nameTh" name="nameTh" defaultValue={cat.nameTh ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="parentId">หมวดแม่</Label>
              <Select id="parentId" name="parentId" defaultValue={cat.parentId ?? ""}>
                <option value="">— ระดับบนสุด —</option>
                {cats.map((p) => (<option key={p.id} value={p.id}>{p.nameTh ?? p.name}</option>))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="assignTeamId">ทีมรับผิดชอบ</Label>
              <Select id="assignTeamId" name="assignTeamId" defaultValue={cat.assignTeamId ?? ""}>
                <option value="">— ไม่ระบุ —</option>
                {teams.map((t) => (<option key={t.id} value={t.id}>{t.nameTh ?? t.name}</option>))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="defaultPriority">Priority เริ่มต้น</Label>
              <Select id="defaultPriority" name="defaultPriority" defaultValue={cat.defaultPriority ?? ""}>
                <option value="">— อัตโนมัติ —</option>
                <option value="P1">P1</option><option value="P2">P2</option>
                <option value="P3">P3</option><option value="P4">P4</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sortOrder">ลำดับ</Label>
              <Input id="sortOrder" name="sortOrder" type="number" min={0} defaultValue={cat.sortOrder} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={cat.active} className="h-4 w-4 rounded border-input" />
              เปิดใช้งาน / Active
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit">บันทึก / Save</Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/settings/support/categories">ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
