import { Activity, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  UP: "success", WARNING: "warning", DOWN: "destructive", UNKNOWN: "secondary",
};
const fmt = (d: Date | null) => (d ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const STALE_MIN = 15;

function Meter({ label, v }: { label: string; v: number | null }) {
  if (v == null) return <div className="text-xs text-muted-foreground">{label} —</div>;
  const color = v > 90 ? "bg-red-500" : v > 75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="min-w-[90px]">
      <div className="flex justify-between text-[10px] text-muted-foreground"><span>{label}</span><span className="tabular-nums">{v}%</span></div>
      <div className="mt-0.5 h-1.5 rounded bg-muted"><div className={`h-full rounded ${color}`} style={{ width: `${v}%` }} /></div>
    </div>
  );
}

function uptimeStr(s: bigint | null): string {
  if (s == null) return "-";
  const days = Number(s) / 86400;
  if (days >= 1) return `${days.toFixed(1)}d`;
  const hrs = Number(s) / 3600;
  return `${hrs.toFixed(1)}h`;
}

export default async function MonitoringPage() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("monitoring:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const now = Date.now();

  const hosts = await prisma.monitoringHost.findMany({ where: { organizationId: orgId }, orderBy: [{ status: "asc" }, { hostname: "asc" }] });
  const up = hosts.filter((h) => h.status === "UP").length;
  const down = hosts.filter((h) => h.status === "DOWN").length;
  const warn = hosts.filter((h) => h.status === "WARNING").length;

  return (
    <div>
      <PageHeader title="การเฝ้าระวังระบบ / Monitoring" description="สถานะ up/down และทรัพยากร (CPU/RAM/Disk) ของเซิร์ฟเวอร์ — ข้อมูล push จาก monitoring agent ในเครือข่าย (ไม่ใช่ข้อมูลจำลอง)" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowUp className="h-3 w-3" /> Up</p><p className="text-2xl font-semibold text-emerald-600">{up}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><AlertTriangle className="h-3 w-3" /> Warning</p><p className="text-2xl font-semibold text-amber-600">{warn}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><ArrowDown className="h-3 w-3" /> Down</p><p className="text-2xl font-semibold text-red-600">{down}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Hosts</p><p className="text-2xl font-semibold">{hosts.length}</p></CardContent></Card>
      </div>

      {hosts.length === 0 && (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          ยังไม่มีข้อมูล — ให้ monitoring agent POST ไปที่ <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">/api/monitoring/ingest</code> ด้วย API key เดียวกับ collector. ตัวอย่าง body: <code className="font-mono text-xs">{`{ "hosts": [{ "hostname": "SRV-01", "cpu": 23, "mem": 61, "disk": 78, "uptime": 864000 }] }`}</code>
        </CardContent></Card>
      )}

      {hosts.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>เครื่อง / Host</TableHead><TableHead>สถานะ</TableHead><TableHead>ทรัพยากร / Resources</TableHead><TableHead>Uptime</TableHead><TableHead>Last seen</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {hosts.map((h) => {
                const stale = !h.lastSeenAt || now - h.lastSeenAt.getTime() > STALE_MIN * 60_000;
                return (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium"><span className="flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-muted-foreground" />{h.hostname}</span>{h.note && <span className="block text-xs text-muted-foreground">{h.note}</span>}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[h.status]}>{h.status}</Badge></TableCell>
                    <TableCell><div className="flex flex-wrap gap-3"><Meter label="CPU" v={h.cpuPercent} /><Meter label="RAM" v={h.memPercent} /><Meter label="Disk" v={h.diskPercent} /></div></TableCell>
                    <TableCell className="text-xs">{uptimeStr(h.uptimeSeconds)}</TableCell>
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
