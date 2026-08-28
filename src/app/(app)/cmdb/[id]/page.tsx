import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Zap, X } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { setCiStatus, addRelationship, deleteRelationship } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  ACTIVE: "success", DEGRADED: "warning", OFFLINE: "destructive", RETIRED: "secondary",
};

export default async function CiDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cmdb:read")) notFound();
  const orgId = user.organizationId;
  const canManage = user.permissions.has("cmdb:manage");

  const ci = await prisma.configurationItem.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    include: {
      asset: { select: { id: true, assetTag: true } },
      outgoing: { include: { target: { select: { id: true, name: true, ciType: true, status: true } } } },
      incoming: { include: { source: { select: { id: true, name: true, ciType: true, status: true } } } },
    },
  });
  if (!ci) notFound();

  // ---- Impact analysis: transitively find CIs that depend on this one ----
  // Load all relationships once; walk INCOMING edges (source depends on target).
  const allRels = await prisma.ciRelationship.findMany({
    where: { organizationId: orgId },
    select: { sourceId: true, targetId: true },
  });
  const dependentsOf = new Map<string, string[]>(); // target -> [sources that depend on it]
  for (const r of allRels) {
    const arr = dependentsOf.get(r.targetId) ?? [];
    arr.push(r.sourceId);
    dependentsOf.set(r.targetId, arr);
  }
  const impacted = new Set<string>();
  const queue = [ci.id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const dep of dependentsOf.get(cur) ?? []) {
      if (!impacted.has(dep) && dep !== ci.id) { impacted.add(dep); queue.push(dep); }
    }
  }
  const impactedItems = impacted.size
    ? await prisma.configurationItem.findMany({
        where: { id: { in: [...impacted] }, organizationId: orgId, deletedAt: null },
        select: { id: true, name: true, ciType: true, status: true },
        orderBy: { ciType: "asc" },
      })
    : [];

  const otherCis = await prisma.configurationItem.findMany({
    where: { organizationId: orgId, deletedAt: null, id: { not: ci.id } },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });

  const addRel = addRelationship.bind(null, ci.id);
  const setStatus = setCiStatus.bind(null, ci.id);
  const delRel = deleteRelationship.bind(null, ci.id);

  function CiChip({ c }: { c: { id: string; name: string; ciType: string; status: string } }) {
    return (
      <Link href={`/cmdb/${c.id}`} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted/50">
        <span className={`h-2 w-2 rounded-full ${c.status === "OFFLINE" ? "bg-red-500" : c.status === "DEGRADED" ? "bg-amber-500" : c.status === "RETIRED" ? "bg-muted-foreground/40" : "bg-emerald-500"}`} />
        <span className="font-medium">{c.name}</span>
        <span className="text-muted-foreground">{c.ciType}</span>
      </Link>
    );
  }

  return (
    <div>
      <PageHeader title={ci.name} description={`Configuration Item · ${ci.ciType}`}>
        <Button variant="outline" asChild><Link href="/cmdb"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge variant={STATUS_VARIANT[ci.status]}>{ci.status}</Badge>
        {ci.owner && <span className="text-sm text-muted-foreground">ผู้ดูแล: {ci.owner}</span>}
        {ci.asset && <Link href={`/assets/${ci.asset.id}`} className="text-sm text-primary hover:underline">Asset: {ci.asset.assetTag}</Link>}
        {canManage && (
          <form action={setStatus} className="ml-auto flex items-center gap-1">
            <Select name="status" defaultValue={ci.status} className="h-8 w-32 text-xs">{["ACTIVE", "DEGRADED", "OFFLINE", "RETIRED"].map((s) => <option key={s} value={s}>{s}</option>)}</Select>
            <Button type="submit" size="sm" variant="outline" className="h-8">อัปเดตสถานะ</Button>
          </form>
        )}
      </div>
      {ci.description && <p className="mb-4 text-sm text-muted-foreground">{ci.description}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ArrowDownRight className="h-4 w-4 text-sky-600" /> ขึ้นอยู่กับ / Depends on ({ci.outgoing.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {ci.outgoing.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
            {ci.outgoing.map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1">
                <CiChip c={r.target} /><span className="text-[10px] text-muted-foreground">{r.relType}</span>
                {canManage && <form action={delRel}><input type="hidden" name="id" value={r.id} /><button className="text-muted-foreground hover:text-red-600"><X className="h-3 w-3" /></button></form>}
              </span>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><ArrowUpRight className="h-4 w-4 text-violet-600" /> ถูกพึ่งพาโดย / Depended on by ({ci.incoming.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {ci.incoming.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
            {ci.incoming.map((r) => <CiChip key={r.id} c={r.source} />)}
          </CardContent>
        </Card>

        <Card className={impactedItems.length ? "border-amber-500/40" : ""}>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Zap className="h-4 w-4 text-amber-600" /> ผลกระทบหากล่ม / Impact if this fails ({impactedItems.length})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {impactedItems.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีระบบอื่นพึ่งพา / Nothing depends on this</p>}
            {impactedItems.map((c) => <CiChip key={c.id} c={c} />)}
          </CardContent>
        </Card>
      </div>

      {canManage && (
        <Card className="mt-4">
          <CardHeader className="pb-2"><CardTitle className="text-sm">เพิ่มความสัมพันธ์ / Add dependency</CardTitle></CardHeader>
          <CardContent>
            <form action={addRel} className="flex flex-wrap items-end gap-2">
              <span className="text-sm text-muted-foreground">{ci.name}</span>
              <Select name="relType" defaultValue="DEPENDS_ON" className="h-9 w-40">{["DEPENDS_ON", "RUNS_ON", "CONNECTS_TO", "HOSTS", "USES"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</Select>
              <Select name="targetId" required defaultValue="" className="h-9 min-w-[200px] flex-1"><option value="" disabled>— เลือก CI ปลายทาง —</option>{otherCis.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Button type="submit">เพิ่ม / Add</Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
