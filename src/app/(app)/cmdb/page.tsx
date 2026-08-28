import Link from "next/link";
import { Boxes, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { createCi } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  ACTIVE: "success", DEGRADED: "warning", OFFLINE: "destructive", RETIRED: "secondary",
};

export default async function CmdbPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cmdb:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const canManage = user.permissions.has("cmdb:manage");
  const orgId = user.organizationId;

  const [items, assets] = await Promise.all([
    prisma.configurationItem.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { _count: { select: { outgoing: true, incoming: true } }, asset: { select: { assetTag: true } } },
      orderBy: [{ ciType: "asc" }, { name: "asc" }],
    }),
    prisma.asset.findMany({ where: { organizationId: orgId, deletedAt: null, status: { notIn: ["DISPOSED"] } }, select: { id: true, assetTag: true, name: true }, orderBy: { assetTag: "asc" }, take: 500 }),
  ]);

  return (
    <div>
      <PageHeader title="CMDB · รายการ Configuration Items" description="แผนผังความสัมพันธ์ของระบบ (App → Server → DB → Network) เพื่อวิเคราะห์ผลกระทบเมื่อระบบล่ม" />

      {canManage && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4 text-primary" /> เพิ่ม CI / Add configuration item</CardTitle></CardHeader>
          <CardContent>
            <form action={createCi} className="grid gap-3 sm:grid-cols-3">
              <div><Label htmlFor="name">ชื่อ / Name *</Label><Input id="name" name="name" required maxLength={200} className="mt-1" placeholder="ERP App · DB-PROD-01" /></div>
              <div><Label htmlFor="ciType">ประเภท / Type *</Label><Select id="ciType" name="ciType" required defaultValue="SERVICE" className="mt-1">{["APPLICATION", "SERVICE", "SERVER", "DATABASE", "NETWORK", "STORAGE", "OTHER"].map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
              <div><Label htmlFor="status">สถานะ / Status *</Label><Select id="status" name="status" required defaultValue="ACTIVE" className="mt-1">{["ACTIVE", "DEGRADED", "OFFLINE", "RETIRED"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
              <div><Label htmlFor="owner">ผู้ดูแล / Owner</Label><Input id="owner" name="owner" className="mt-1" /></div>
              <div><Label htmlFor="assetId">ผูกทรัพย์สิน / Asset</Label><Select id="assetId" name="assetId" className="mt-1" defaultValue=""><option value="">—</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.assetTag} · {a.name}</option>)}</Select></div>
              <div className="flex items-end"><Button type="submit" className="w-full"><Plus className="h-4 w-4" /> เพิ่ม</Button></div>
              <div className="sm:col-span-3"><Label htmlFor="description">คำอธิบาย / Description</Label><Input id="description" name="description" className="mt-1" /></div>
            </form>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader><TableRow>
          <TableHead>ชื่อ / Name</TableHead><TableHead>ประเภท</TableHead><TableHead>สถานะ</TableHead><TableHead>ขึ้นกับ / Depends</TableHead><TableHead>ถูกพึ่งพา / Dependents</TableHead><TableHead>Asset</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {items.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ยังไม่มี CI / No configuration items</TableCell></TableRow>}
          {items.map((ci) => (
            <TableRow key={ci.id}>
              <TableCell className="font-medium"><Link href={`/cmdb/${ci.id}`} className="flex items-center gap-2 text-primary hover:underline"><Boxes className="h-3.5 w-3.5 text-muted-foreground" />{ci.name}</Link></TableCell>
              <TableCell className="text-xs">{ci.ciType}</TableCell>
              <TableCell><Badge variant={STATUS_VARIANT[ci.status]}>{ci.status}</Badge></TableCell>
              <TableCell className="tabular-nums">{ci._count.outgoing}</TableCell>
              <TableCell className="tabular-nums">{ci._count.incoming}</TableCell>
              <TableCell className="text-xs">{ci.asset?.assetTag ?? "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
