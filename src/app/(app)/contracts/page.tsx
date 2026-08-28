import { FileText, Plus, Trash2 } from "lucide-react";
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
import { createContract, deleteContract } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  ACTIVE: "success", EXPIRING: "warning", EXPIRED: "destructive", TERMINATED: "secondary",
};
const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-");

export default async function ContractsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("contract:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const canManage = user.permissions.has("contract:manage");
  const orgId = user.organizationId;
  const soon = new Date(Date.now() + 60 * 86_400_000);

  const [contracts, vendors, renewingSoon] = await Promise.all([
    prisma.contract.findMany({ where: { organizationId: orgId, deletedAt: null }, include: { vendor: { select: { name: true } } }, orderBy: [{ status: "asc" }, { renewalDate: "asc" }] }),
    prisma.vendor.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contract.count({ where: { organizationId: orgId, deletedAt: null, status: { not: "TERMINATED" }, renewalDate: { not: null, lte: soon } } }),
  ]);

  return (
    <div>
      <PageHeader title="สัญญา & การรับประกัน / Contracts" description="สัญญาบริการ วันหมดอายุ/ต่ออายุ ค่าใช้จ่าย เงื่อนไข SLA และผู้จำหน่าย" />

      {renewingSoon > 0 && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          มี {renewingSoon} สัญญาที่ครบกำหนดต่ออายุภายใน 60 วัน — ระบบจะแจ้งเตือนอัตโนมัติผ่าน cron รายวัน
        </div>
      )}

      {canManage && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4 text-primary" /> เพิ่มสัญญา / Add contract</CardTitle></CardHeader>
          <CardContent>
            <form action={createContract} className="grid gap-3 sm:grid-cols-4">
              <div><Label htmlFor="contractNumber">เลขที่ / No. *</Label><Input id="contractNumber" name="contractNumber" required maxLength={100} className="mt-1" /></div>
              <div className="sm:col-span-2"><Label htmlFor="title">ชื่อสัญญา / Title *</Label><Input id="title" name="title" required maxLength={300} className="mt-1" /></div>
              <div><Label htmlFor="status">สถานะ / Status *</Label><Select id="status" name="status" required defaultValue="ACTIVE" className="mt-1">{["ACTIVE", "EXPIRING", "EXPIRED", "TERMINATED"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
              <div><Label htmlFor="vendorId">ผู้จำหน่าย / Vendor</Label><Select id="vendorId" name="vendorId" className="mt-1" defaultValue=""><option value="">—</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></div>
              <div><Label htmlFor="service">บริการ / Service</Label><Input id="service" name="service" className="mt-1" /></div>
              <div><Label htmlFor="cost">มูลค่า / Cost</Label><Input id="cost" name="cost" type="number" min={0} step="0.01" className="mt-1" /></div>
              <div><Label htmlFor="owner">ผู้ดูแล / Owner</Label><Input id="owner" name="owner" className="mt-1" /></div>
              <div><Label htmlFor="startDate">เริ่ม / Start</Label><Input id="startDate" name="startDate" type="date" className="mt-1" /></div>
              <div><Label htmlFor="endDate">สิ้นสุด / End</Label><Input id="endDate" name="endDate" type="date" className="mt-1" /></div>
              <div><Label htmlFor="renewalDate">ต่ออายุ / Renewal</Label><Input id="renewalDate" name="renewalDate" type="date" className="mt-1" /></div>
              <div className="flex items-end gap-2"><label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" name="autoRenew" value="on" className="h-3.5 w-3.5" /> Auto-renew</label></div>
              <div className="sm:col-span-3"><Label htmlFor="slaTerms">เงื่อนไข SLA / SLA terms</Label><Input id="slaTerms" name="slaTerms" className="mt-1" /></div>
              <div className="flex items-end"><Button type="submit" className="w-full"><Plus className="h-4 w-4" /> เพิ่ม</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

        <Table>
          <TableHeader><TableRow>
            <TableHead>เลขที่</TableHead><TableHead>ชื่อสัญญา</TableHead><TableHead>Vendor</TableHead><TableHead>เริ่ม–สิ้นสุด</TableHead><TableHead>ต่ออายุ</TableHead><TableHead>มูลค่า</TableHead><TableHead>สถานะ</TableHead>{canManage && <TableHead></TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {contracts.length === 0 && <TableRow><TableCell colSpan={canManage ? 8 : 7} className="py-8 text-center text-muted-foreground">ยังไม่มีสัญญา / No contracts</TableCell></TableRow>}
            {contracts.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-xs">{c.contractNumber}</TableCell>
                <TableCell className="font-medium"><span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-muted-foreground" />{c.title}</span>{c.service && <span className="block text-xs text-muted-foreground">{c.service}</span>}</TableCell>
                <TableCell>{c.vendor?.name ?? "-"}</TableCell>
                <TableCell className="text-xs">{fmt(c.startDate)} – {fmt(c.endDate)}</TableCell>
                <TableCell className="text-xs">{fmt(c.renewalDate)}{c.autoRenew && <Badge variant="secondary" className="ml-1">auto</Badge>}</TableCell>
                <TableCell className="text-xs tabular-nums">{c.cost ? Number(c.cost).toLocaleString() : "-"}</TableCell>
                <TableCell><Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge></TableCell>
                {canManage && <TableCell><form action={deleteContract}><input type="hidden" name="id" value={c.id} /><Button type="submit" size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button></form></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
    </div>
  );
}
