import { ShieldCheck, ShieldAlert, WifiOff, HelpCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const META: Record<string, { variant: "success" | "destructive" | "warning" | "secondary"; Icon: React.ComponentType<{ className?: string }> }> = {
  PROTECTED: { variant: "success", Icon: ShieldCheck },
  AT_RISK: { variant: "destructive", Icon: ShieldAlert },
  OFFLINE: { variant: "secondary", Icon: WifiOff },
  UNKNOWN: { variant: "secondary", Icon: HelpCircle },
};
const fmt = (d: Date | null) => (d ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const STALE_MIN = 60;

export default async function EndpointsPage() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("monitoring:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const now = Date.now();

  const [hosts, counts] = await Promise.all([
    prisma.endpointPosture.findMany({
      where: { organizationId: orgId },
      include: { asset: { select: { assetTag: true } } },
      orderBy: [{ protectionStatus: "asc" }, { hostname: "asc" }],
    }),
    prisma.endpointPosture.groupBy({ by: ["protectionStatus"], where: { organizationId: orgId }, _count: true }),
  ]);
  const by = new Map(counts.map((c) => [c.protectionStatus, c._count]));
  const threats = hosts.reduce((s, h) => s + h.threatsFound, 0);

  return (
    <div>
      <PageHeader title="ความปลอดภัยเครื่องปลายทาง / Endpoint Security (EDR)" description="สถานะป้องกัน antivirus/EDR ของแต่ละเครื่อง — ข้อมูลถูก push จาก agent ในเครือข่าย (ไม่ใช่ข้อมูลจำลอง)" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Protected</p><p className="text-2xl font-semibold text-emerald-600">{by.get("PROTECTED") ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">At risk</p><p className="text-2xl font-semibold text-red-600">{by.get("AT_RISK") ?? 0}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Offline/Unknown</p><p className="text-2xl font-semibold">{(by.get("OFFLINE") ?? 0) + (by.get("UNKNOWN") ?? 0)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Threats found</p><p className="text-2xl font-semibold text-red-600">{threats}</p></CardContent></Card>
      </div>

      {hosts.length === 0 && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          ยังไม่มีข้อมูล — ให้ agent ที่เครื่องปลายทาง POST ไปที่ <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/api/edr/ingest</code> ด้วย API key เดียวกับ collector (Settings → Integrations). ตัวอย่าง body: <code className="font-mono text-xs">{`{ "hosts": [{ "hostname": "PC-01", "protectionStatus": "PROTECTED", "lastScan": "2026-08-28T02:00:00Z", "threatsFound": 0 }] }`}</code>
        </CardContent></Card>
      )}

      {hosts.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>เครื่อง / Host</TableHead><TableHead>สถานะ</TableHead><TableHead>Threats</TableHead><TableHead>Isolated</TableHead><TableHead>Agent</TableHead><TableHead>Last scan</TableHead><TableHead>Last seen</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {hosts.map((h) => {
                const m = META[h.protectionStatus];
                const stale = !h.lastSeenAt || now - h.lastSeenAt.getTime() > STALE_MIN * 60_000;
                return (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium"><span className="flex items-center gap-2"><m.Icon className="h-3.5 w-3.5 text-muted-foreground" />{h.hostname}</span>{h.asset && <span className="block text-xs text-muted-foreground">{h.asset.assetTag}</span>}</TableCell>
                    <TableCell><Badge variant={m.variant}>{h.protectionStatus}</Badge></TableCell>
                    <TableCell className={h.threatsFound > 0 ? "font-semibold text-red-600" : "text-muted-foreground"}>{h.threatsFound}</TableCell>
                    <TableCell>{h.isolated ? <Badge variant="destructive">Isolated</Badge> : "-"}</TableCell>
                    <TableCell className="text-xs">{h.agentVersion ?? "-"}</TableCell>
                    <TableCell className="text-xs">{fmt(h.lastScanAt)}</TableCell>
                    <TableCell className="text-xs">{fmt(h.lastSeenAt)}{stale && <span className="block text-amber-600">stale</span>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
