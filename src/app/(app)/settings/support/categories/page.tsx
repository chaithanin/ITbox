import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { MessageBanner } from "../message-banner";
import { createCategory, deleteCategory } from "../actions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("support:settings");
  const sp = await searchParams;
  const [cats, teams] = await Promise.all([
    prisma.caseCategory.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { assignTeam: { select: { name: true } } },
    }),
    prisma.supportTeam.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);
  const parents = cats.filter((c) => !c.parentId);
  const childrenOf = (id: string) => cats.filter((c) => c.parentId === id);

  return (
    <div>
      <PageHeader
        title="หมวดหมู่เคส / Categories"
        description="หมวดหมู่ → หมวดย่อย → ทีมที่รับผิดชอบ → ความเร่งด่วนเริ่มต้น"
      >
        <Button variant="outline" asChild>
          <Link href="/settings/support">← กลับ / Back</Link>
        </Button>
      </PageHeader>
      <MessageBanner ok={sp.ok} error={sp.error} />

      <Card className="mb-4">
        <CardHeader><CardTitle>เพิ่มหมวดหมู่ / Add category</CardTitle></CardHeader>
        <CardContent>
          <form action={createCategory} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="name">ชื่อ (EN) / Name</Label>
              <Input id="name" name="name" required maxLength={120} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nameTh">ชื่อ (ไทย)</Label>
              <Input id="nameTh" name="nameTh" maxLength={120} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="parentId">หมวดแม่ / Parent</Label>
              <Select id="parentId" name="parentId" defaultValue="">
                <option value="">— ระดับบนสุด / Top level —</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>{p.nameTh ?? p.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="assignTeamId">ทีมรับผิดชอบ / Team</Label>
              <Select id="assignTeamId" name="assignTeamId" defaultValue="">
                <option value="">— ไม่ระบุ —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.nameTh ?? t.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="defaultPriority">Priority เริ่มต้น</Label>
              <Select id="defaultPriority" name="defaultPriority" defaultValue="">
                <option value="">— อัตโนมัติ / Auto —</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
                <option value="P4">P4</option>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sortOrder">ลำดับ / Order</Label>
              <Input id="sortOrder" name="sortOrder" type="number" defaultValue={0} min={0} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" name="active" defaultChecked className="h-4 w-4 rounded border-input" />
              เปิดใช้งาน / Active
            </label>
            <div className="flex items-end">
              <Button type="submit" className="w-full">เพิ่ม / Add</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>หมวดหมู่ / Category</TableHead>
            <TableHead>ทีม / Team</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>สถานะ</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parents.length === 0 && (
            <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">ยังไม่มีหมวดหมู่ / No categories</TableCell></TableRow>
          )}
          {parents.map((p) => (
            <CategoryRows
              key={p.id}
              parent={p}
              subs={childrenOf(p.id)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CategoryRows({
  parent,
  subs,
}: {
  parent: { id: string; name: string; nameTh: string | null; active: boolean; defaultPriority: string | null; assignTeam: { name: string } | null };
  subs: Array<{ id: string; name: string; nameTh: string | null; active: boolean; defaultPriority: string | null; assignTeam: { name: string } | null }>;
}) {
  const rows = [parent, ...subs];
  return (
    <>
      {rows.map((c, i) => {
        const del = deleteCategory.bind(null, c.id);
        return (
          <TableRow key={c.id}>
            <TableCell className={i === 0 ? "font-medium" : "pl-8 text-muted-foreground"}>
              {i === 0 ? (c.nameTh ?? c.name) : `↳ ${c.nameTh ?? c.name}`}
            </TableCell>
            <TableCell>{c.assignTeam?.name ?? "-"}</TableCell>
            <TableCell>{c.defaultPriority ? <StatusBadge status={c.defaultPriority} /> : <span className="text-muted-foreground">auto</span>}</TableCell>
            <TableCell>{c.active ? <Badge variant="success">เปิด</Badge> : <Badge variant="secondary">ปิด</Badge>}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Link href={`/settings/support/categories/${c.id}/edit`} className="text-sm text-primary hover:underline">แก้ไข</Link>
                <form action={del}>
                  <ConfirmButton variant="ghost" size="sm" confirmText="ลบหมวดหมู่นี้? / Delete category?">ลบ</ConfirmButton>
                </form>
              </div>
            </TableCell>
          </TableRow>
        );
      })}
    </>
  );
}
