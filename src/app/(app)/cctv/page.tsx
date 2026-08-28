import Link from "next/link";
import { Cctv, Video, VideoOff, AlertTriangle, Upload } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  const color = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "";
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`text-2xl font-semibold ${color}`}>{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

export default async function CctvOverviewPage() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:view")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const canManage = user.permissions.has("cctv:manage");
  const where = { organizationId: orgId, deletedAt: null };

  const [recorders, cameras, openIncidents, recentStorage] = await Promise.all([
    prisma.cctvRecorder.findMany({ where, select: { id: true, name: true, project: true, status: true } }),
    prisma.cctvCamera.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { status: true, recordingStatus: true, recorderId: true } }),
    prisma.cctvIncident.count({ where: { organizationId: orgId, status: { in: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] } } }),
    prisma.cctvStorageLog.findMany({ where: { organizationId: orgId }, orderBy: { checkedAt: "desc" }, take: 200, select: { status: true, recorderId: true } }),
  ]);

  const recOnline = recorders.filter((r) => r.status === "ONLINE").length;
  const recOffline = recorders.filter((r) => r.status === "OFFLINE").length;
  const camOnline = cameras.filter((c) => c.status === "ONLINE").length;
  const camOffline = cameras.filter((c) => c.status === "OFFLINE" || c.status === "NETWORK_ERROR").length;
  const videoLoss = cameras.filter((c) => c.status === "VIDEO_LOSS").length;
  const noRecording = cameras.filter((c) => c.recordingStatus === "NO_RECORDING_FOUND" || c.recordingStatus === "NOT_RECORDING").length;
  // Latest storage status per recorder
  const latestStoByRec = new Map<string, string>();
  for (const s of recentStorage) if (!latestStoByRec.has(s.recorderId)) latestStoByRec.set(s.recorderId, s.status);
  const hddWarn = [...latestStoByRec.values()].filter((s) => s === "WARNING" || s === "CRITICAL" || s === "FAILED").length;

  // Project summary
  const byProject = new Map<string, { total: number; online: number }>();
  const recCamCount = new Map<string, { total: number; online: number }>();
  for (const c of cameras) {
    const rc = recCamCount.get(c.recorderId) ?? { total: 0, online: 0 };
    rc.total++; if (c.status === "ONLINE") rc.online++;
    recCamCount.set(c.recorderId, rc);
  }
  for (const r of recorders) {
    const p = r.project ?? "ไม่ระบุ / Unassigned";
    const agg = byProject.get(p) ?? { total: 0, online: 0 };
    const rc = recCamCount.get(r.id) ?? { total: 0, online: 0 };
    agg.total += rc.total; agg.online += rc.online;
    byProject.set(p, agg);
  }
  const projects = [...byProject.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const empty = recorders.length === 0;

  return (
    <div>
      <PageHeader
        title="CCTV Monitoring — ภาพรวม"
        description="สถานะเครื่องบันทึก กล้อง การบันทึก และพื้นที่จัดเก็บแบบรวมศูนย์ (read-only)"
      >
        {canManage && <Link href="/cctv/import"><Button size="sm"><Upload className="mr-2 h-4 w-4" /> นำเข้า device.xml</Button></Link>}
      </PageHeader>

      {empty ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          <Cctv className="mx-auto mb-3 h-8 w-8 opacity-50" />
          ยังไม่มีเครื่องบันทึกในระบบ — {canManage ? <Link href="/cctv/import" className="text-primary underline">นำเข้า device.xml</Link> : "ให้ผู้ดูแลนำเข้า device.xml"} เพื่อเริ่มต้น
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <Kpi label="เครื่องบันทึกทั้งหมด" value={recorders.length} />
            <Kpi label="เครื่องออนไลน์" value={recOnline} tone="ok" />
            <Kpi label="เครื่องออฟไลน์" value={recOffline} tone={recOffline ? "bad" : undefined} />
            <Kpi label="กล้องทั้งหมด" value={cameras.length} />
            <Kpi label="กล้องออนไลน์" value={camOnline} tone="ok" />
            <Kpi label="กล้องออฟไลน์" value={camOffline} tone={camOffline ? "bad" : undefined} />
            <Kpi label="Video Loss" value={videoLoss} tone={videoLoss ? "warn" : undefined} />
            <Kpi label="ไม่บันทึก" value={noRecording} tone={noRecording ? "warn" : undefined} />
            <Kpi label="HDD เตือน" value={hddWarn} tone={hddWarn ? "warn" : undefined} />
            <Kpi label="เหตุการณ์ค้าง" value={openIncidents} tone={openIncidents ? "bad" : undefined} />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Video className="h-4 w-4" /> สถานะตามโครงการ / By Project</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {projects.map(([p, agg]) => {
                  const bad = agg.total - agg.online;
                  return (
                    <div key={p} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span className="font-medium">{p}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">{agg.online}/{agg.total} กล้องออนไลน์</span>
                        {bad > 0 ? <Badge variant="destructive">{bad} มีปัญหา</Badge> : <Badge variant="success">ปกติ</Badge>}
                      </span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4" /> ทางลัด / Quick Links</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-sm">
                <Link href="/cctv/devices" className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent"><Cctv className="h-4 w-4" /> เครื่องบันทึก</Link>
                <Link href="/cctv/cameras" className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent"><Video className="h-4 w-4" /> กล้องทั้งหมด</Link>
                <Link href="/cctv/incidents" className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent"><AlertTriangle className="h-4 w-4" /> เหตุการณ์</Link>
                <Link href="/cctv/cameras?filter=offline" className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-accent"><VideoOff className="h-4 w-4" /> กล้องมีปัญหา</Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
