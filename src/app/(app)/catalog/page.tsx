import Link from "next/link";
import { LayoutGrid, Plus, Check, X, Trash2, ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createCatalogItem, toggleCatalogItem, deleteCatalogItem } from "./actions";

export const dynamic = "force-dynamic";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("catalog:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const canManage = user.permissions.has("catalog:manage");
  const canRequest = user.permissions.has("support:create");
  const orgId = user.organizationId;

  const items = await prisma.serviceCatalogItem.findMany({
    where: { organizationId: orgId, deletedAt: null, ...(canManage ? {} : { active: true }) },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const grouped = new Map<string, typeof items>();
  for (const it of items) {
    const k = it.category ?? "ทั่วไป / General";
    const arr = grouped.get(k) ?? [];
    arr.push(it);
    grouped.set(k, arr);
  }

  return (
    <div>
      <PageHeader title="แคตตาล็อกบริการ / Service Catalog" description="รายการบริการ IT ที่ขอได้ — ระบุการอนุมัติ, SLA และทีมที่รับผิดชอบ" />

      {canManage && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4 text-primary" /> เพิ่มบริการ / Add service</CardTitle></CardHeader>
          <CardContent>
            <form action={createCatalogItem} className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2"><Label htmlFor="name">ชื่อบริการ / Name *</Label><Input id="name" name="name" required maxLength={200} className="mt-1" placeholder="ขอสิทธิ์ VPN · ติดตั้งซอฟต์แวร์" /></div>
              <div><Label htmlFor="category">หมวดหมู่ / Category</Label><Input id="category" name="category" className="mt-1" /></div>
              <div><Label htmlFor="fulfillmentTeam">ทีมรับผิดชอบ / Team</Label><Input id="fulfillmentTeam" name="fulfillmentTeam" className="mt-1" /></div>
              <div><Label htmlFor="slaHours">SLA (ชม.)</Label><Input id="slaHours" name="slaHours" type="number" min={0} className="mt-1" /></div>
              <div className="sm:col-span-2"><Label htmlFor="description">คำอธิบาย / Description</Label><Textarea id="description" name="description" rows={1} className="mt-1" /></div>
              <div className="flex items-end gap-3"><label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" name="requiresApproval" value="on" className="h-3.5 w-3.5" /> ต้องอนุมัติ</label><Button type="submit"><Plus className="h-4 w-4" /> เพิ่ม</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      {items.length === 0 && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">ยังไม่มีบริการในแคตตาล็อก</p>}

      {[...grouped.entries()].map(([cat, list]) => (
        <div key={cat} className="mb-5">
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{cat}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((it) => (
              <Card key={it.id} className={it.active ? "" : "opacity-60"}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <LayoutGrid className="h-4 w-4 shrink-0 text-primary" />
                    <div className="flex gap-1">
                      {it.requiresApproval && <Badge variant="warning">ต้องอนุมัติ</Badge>}
                      {it.slaHours != null && <Badge variant="secondary">SLA {it.slaHours}h</Badge>}
                    </div>
                  </div>
                  <p className="font-medium leading-tight">{it.name}</p>
                  {it.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{it.description}</p>}
                  {it.fulfillmentTeam && <p className="mt-1 text-[11px] text-muted-foreground">ทีม: {it.fulfillmentTeam}</p>}
                  <div className="mt-3 flex items-center gap-2">
                    {canRequest && it.active && (
                      <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                        <Link href={`/support/new?subject=${encodeURIComponent(it.name)}`}>ขอบริการ <ArrowRight className="h-3 w-3" /></Link>
                      </Button>
                    )}
                    {canManage && (
                      <>
                        <form action={toggleCatalogItem}><input type="hidden" name="id" value={it.id} /><Button type="submit" size="sm" variant="ghost" className="h-7 text-xs">{it.active ? <><X className="h-3 w-3" /> ปิด</> : <><Check className="h-3 w-3" /> เปิด</>}</Button></form>
                        <form action={deleteCatalogItem}><input type="hidden" name="id" value={it.id} /><Button type="submit" size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-red-600"><Trash2 className="h-3 w-3" /></Button></form>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
