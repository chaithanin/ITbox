import Link from "next/link";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
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
import { createVlan, createSubnet, createIp, deleteIp } from "../actions";

export const dynamic = "force-dynamic";

const IP_VARIANT: Record<string, "success" | "warning" | "secondary"> = {
  AVAILABLE: "success", ASSIGNED: "secondary", RESERVED: "warning",
};

export default async function IpamPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("network:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const canManage = user.permissions.has("network:manage");
  const orgId = user.organizationId;

  const [vlans, subnets, ips] = await Promise.all([
    prisma.vlan.findMany({ where: { organizationId: orgId, deletedAt: null }, orderBy: { vlanId: "asc" } }),
    prisma.subnet.findMany({ where: { organizationId: orgId, deletedAt: null }, include: { vlan: { select: { vlanId: true, name: true } } }, orderBy: { cidr: "asc" } }),
    prisma.ipAddress.findMany({ where: { organizationId: orgId, deletedAt: null }, include: { subnet: { select: { cidr: true } } }, orderBy: { address: "asc" }, take: 500 }),
  ]);

  return (
    <div>
      <PageHeader title="IP Address Management" description="Subnet · VLAN · IP address พร้อมกันจ่าย IP ซ้ำ (unique per org)">
        <Button variant="outline" asChild><Link href="/network"><ArrowLeft className="h-4 w-4" /> Devices</Link></Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* VLANs */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">VLANs ({vlans.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {canManage && (
              <form action={createVlan} className="grid grid-cols-2 gap-2">
                <Input name="vlanId" type="number" min={1} max={4094} required placeholder="VLAN ID" />
                <Input name="name" required placeholder="ชื่อ / Name" />
                <Input name="purpose" placeholder="วัตถุประสงค์ / Purpose" className="col-span-2" />
                <Button type="submit" size="sm" className="col-span-2"><Plus className="h-3.5 w-3.5" /> เพิ่ม VLAN</Button>
              </form>
            )}
            <Table><TableHeader><TableRow><TableHead>VLAN</TableHead><TableHead>ชื่อ</TableHead><TableHead>Purpose</TableHead></TableRow></TableHeader>
              <TableBody>
                {vlans.length === 0 && <TableRow><TableCell colSpan={3} className="py-4 text-center text-muted-foreground">—</TableCell></TableRow>}
                {vlans.map((v) => <TableRow key={v.id}><TableCell className="font-mono">{v.vlanId}</TableCell><TableCell>{v.name}</TableCell><TableCell className="text-muted-foreground">{v.purpose ?? "-"}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Subnets */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Subnets ({subnets.length})</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {canManage && (
              <form action={createSubnet} className="grid grid-cols-2 gap-2">
                <Input name="cidr" required placeholder="10.0.0.0/24" />
                <Input name="gateway" placeholder="Gateway" />
                <Input name="dns" placeholder="DNS" />
                <Select name="vlanRef" defaultValue=""><option value="">— VLAN —</option>{vlans.map((v) => <option key={v.id} value={v.id}>{v.vlanId} · {v.name}</option>)}</Select>
                <Input name="purpose" placeholder="วัตถุประสงค์ / Purpose" className="col-span-2" />
                <Button type="submit" size="sm" className="col-span-2"><Plus className="h-3.5 w-3.5" /> เพิ่ม Subnet</Button>
              </form>
            )}
            <Table><TableHeader><TableRow><TableHead>CIDR</TableHead><TableHead>Gateway</TableHead><TableHead>VLAN</TableHead></TableRow></TableHeader>
              <TableBody>
                {subnets.length === 0 && <TableRow><TableCell colSpan={3} className="py-4 text-center text-muted-foreground">—</TableCell></TableRow>}
                {subnets.map((s) => <TableRow key={s.id}><TableCell className="font-mono">{s.cidr}</TableCell><TableCell className="font-mono text-xs">{s.gateway ?? "-"}</TableCell><TableCell>{s.vlan ? `${s.vlan.vlanId}` : "-"}</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* IP addresses */}
      <Card className="mt-4">
        <CardHeader className="pb-2"><CardTitle className="text-sm">IP Addresses ({ips.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {canManage && (
            <form action={createIp} className="grid gap-2 sm:grid-cols-6">
              <Input name="address" required placeholder="10.0.0.5" />
              <Select name="status" defaultValue="ASSIGNED">{["AVAILABLE", "ASSIGNED", "RESERVED"].map((s) => <option key={s} value={s}>{s}</option>)}</Select>
              <Select name="subnetId" defaultValue=""><option value="">— Subnet —</option>{subnets.map((s) => <option key={s.id} value={s.id}>{s.cidr}</option>)}</Select>
              <Input name="hostname" placeholder="Hostname" />
              <Input name="assignedTo" placeholder="ผู้ใช้/อุปกรณ์" />
              <Button type="submit" size="sm"><Plus className="h-3.5 w-3.5" /> เพิ่ม IP</Button>
            </form>
          )}
          <Table><TableHeader><TableRow>
            <TableHead>IP</TableHead><TableHead>สถานะ</TableHead><TableHead>Subnet</TableHead><TableHead>Hostname</TableHead><TableHead>ผู้ใช้/อุปกรณ์</TableHead>{canManage && <TableHead></TableHead>}
          </TableRow></TableHeader>
            <TableBody>
              {ips.length === 0 && <TableRow><TableCell colSpan={canManage ? 6 : 5} className="py-6 text-center text-muted-foreground">—</TableCell></TableRow>}
              {ips.map((ip) => (
                <TableRow key={ip.id}>
                  <TableCell className="font-mono">{ip.address}</TableCell>
                  <TableCell><Badge variant={IP_VARIANT[ip.status]}>{ip.status}</Badge></TableCell>
                  <TableCell className="font-mono text-xs">{ip.subnet?.cidr ?? "-"}</TableCell>
                  <TableCell>{ip.hostname ?? "-"}</TableCell>
                  <TableCell>{ip.assignedTo ?? "-"}</TableCell>
                  {canManage && <TableCell><form action={deleteIp}><input type="hidden" name="id" value={ip.id} /><Button type="submit" variant="ghost" size="sm" className="h-7 text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button></form></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {ips.length >= 500 && <p className="text-xs text-muted-foreground">แสดง 500 รายการแรก / Showing first 500</p>}
        </CardContent>
      </Card>
    </div>
  );
}
