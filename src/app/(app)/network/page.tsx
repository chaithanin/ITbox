import Link from "next/link";
import { Router, Plus, Trash2 } from "lucide-react";
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
import { createDevice, deleteDevice } from "./actions";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  ROUTER: "Router", SWITCH: "Switch", FIREWALL: "Firewall", ACCESS_POINT: "Access Point",
  LOAD_BALANCER: "Load Balancer", CONTROLLER: "Controller", GATEWAY: "Gateway", OTHER: "Other",
};
const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  ONLINE: "success", OFFLINE: "destructive", MAINTENANCE: "warning", UNKNOWN: "secondary",
};

export default async function NetworkPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("network:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.</div>;
  }
  const canManage = user.permissions.has("network:manage");
  const orgId = user.organizationId;

  const [devices, vendors, locations, counts] = await Promise.all([
    prisma.networkDevice.findMany({
      where: { organizationId: orgId, deletedAt: null },
      include: { vendor: { select: { name: true } }, location: { select: { name: true } } },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
    prisma.vendor.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.networkDevice.groupBy({ by: ["status"], where: { organizationId: orgId, deletedAt: null }, _count: true }),
  ]);
  const countBy = new Map(counts.map((c) => [c.status, c._count]));

  return (
    <div>
      <PageHeader title="อุปกรณ์เครือข่าย / Network Devices" description="Switch · Router · Firewall · Access Point และอุปกรณ์เครือข่ายอื่น ๆ">
        <Button variant="outline" asChild><Link href="/network/ipam">IP / Subnet / VLAN →</Link></Button>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["ONLINE", "OFFLINE", "MAINTENANCE", "UNKNOWN"] as const).map((s) => (
          <Card key={s}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{s}</p>
            <p className="text-2xl font-semibold">{countBy.get(s) ?? 0}</p>
          </CardContent></Card>
        ))}
      </div>

      {canManage && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4 text-primary" /> เพิ่มอุปกรณ์ / Add device</CardTitle></CardHeader>
          <CardContent>
            <form action={createDevice} className="grid gap-3 sm:grid-cols-3">
              <div><Label htmlFor="name">ชื่อ / Name *</Label><Input id="name" name="name" required maxLength={200} className="mt-1" placeholder="Core-SW-01" /></div>
              <div><Label htmlFor="deviceType">ประเภท / Type *</Label>
                <Select id="deviceType" name="deviceType" required defaultValue="SWITCH" className="mt-1">
                  {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </div>
              <div><Label htmlFor="status">สถานะ / Status *</Label>
                <Select id="status" name="status" required defaultValue="UNKNOWN" className="mt-1">
                  {["ONLINE", "OFFLINE", "MAINTENANCE", "UNKNOWN"].map((v) => <option key={v} value={v}>{v}</option>)}
                </Select>
              </div>
              <div><Label htmlFor="mgmtIp">Management IP</Label><Input id="mgmtIp" name="mgmtIp" className="mt-1" placeholder="192.168.1.1" /></div>
              <div><Label htmlFor="hostname">Hostname</Label><Input id="hostname" name="hostname" className="mt-1" /></div>
              <div><Label htmlFor="macAddress">MAC</Label><Input id="macAddress" name="macAddress" className="mt-1" /></div>
              <div><Label htmlFor="model">รุ่น / Model</Label><Input id="model" name="model" className="mt-1" /></div>
              <div><Label htmlFor="firmware">Firmware</Label><Input id="firmware" name="firmware" className="mt-1" /></div>
              <div><Label htmlFor="vendorId">ผู้จำหน่าย / Vendor</Label>
                <Select id="vendorId" name="vendorId" className="mt-1" defaultValue=""><option value="">—</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
              </div>
              <div><Label htmlFor="locationId">สถานที่ / Location</Label>
                <Select id="locationId" name="locationId" className="mt-1" defaultValue=""><option value="">—</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
              </div>
              <div><Label htmlFor="owner">ผู้ดูแล / Owner</Label><Input id="owner" name="owner" className="mt-1" /></div>
              <div className="flex items-end"><Button type="submit" className="w-full"><Plus className="h-4 w-4" /> เพิ่ม / Add</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader><TableRow>
          <TableHead>ชื่อ / Name</TableHead><TableHead>ประเภท</TableHead><TableHead>Mgmt IP</TableHead>
          <TableHead>Vendor</TableHead><TableHead>สถานที่</TableHead><TableHead>สถานะ</TableHead>{canManage && <TableHead></TableHead>}
        </TableRow></TableHeader>
        <TableBody>
          {devices.length === 0 && <TableRow><TableCell colSpan={canManage ? 7 : 6} className="py-8 text-center text-muted-foreground">ยังไม่มีอุปกรณ์ / No devices</TableCell></TableRow>}
          {devices.map((d) => (
            <TableRow key={d.id}>
              <TableCell className="font-medium"><span className="flex items-center gap-2"><Router className="h-3.5 w-3.5 text-muted-foreground" />{d.name}</span>{d.hostname && <span className="block text-xs text-muted-foreground">{d.hostname}</span>}</TableCell>
              <TableCell>{TYPE_LABEL[d.deviceType]}</TableCell>
              <TableCell className="font-mono text-xs">{d.mgmtIp ?? "-"}</TableCell>
              <TableCell>{d.vendor?.name ?? "-"}</TableCell>
              <TableCell>{d.location?.name ?? "-"}</TableCell>
              <TableCell><Badge variant={STATUS_VARIANT[d.status]}>{d.status}</Badge></TableCell>
              {canManage && <TableCell>
                <form action={deleteDevice}><input type="hidden" name="id" value={d.id} />
                  <Button type="submit" variant="ghost" size="sm" className="h-7 text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                </form>
              </TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
