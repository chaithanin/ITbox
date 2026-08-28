import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Video } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge, formatRetention, timeAgo } from "../../_status";

export const dynamic = "force-dynamic";

function uptimePct(logs: { cameraStatus: string | null }[]): string {
  const rated = logs.filter((l) => l.cameraStatus && l.cameraStatus !== "UNKNOWN");
  if (rated.length === 0) return "—";
  const up = rated.filter((l) => l.cameraStatus === "ONLINE").length;
  return `${((up / rated.length) * 100).toFixed(1)}%`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export default async function CameraDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:view")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const cam = await prisma.cctvCamera.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    include: { recorder: { select: { name: true, project: true, site: true, status: true, serial: true } } },
  });
  if (!cam) notFound();

  const now = Date.now();
  const d1 = new Date(now - 24 * 3600 * 1000);
  const d7 = new Date(now - 7 * 24 * 3600 * 1000);
  const [events, logs7, incidents] = await Promise.all([
    prisma.cctvHealthLog.findMany({ where: { organizationId: orgId, cameraId: id, checkedAt: { gte: d1 } }, orderBy: { checkedAt: "desc" }, take: 100 }),
    prisma.cctvHealthLog.findMany({ where: { organizationId: orgId, cameraId: id, checkedAt: { gte: d7 } }, select: { cameraStatus: true, checkedAt: true } }),
    prisma.cctvIncident.findMany({ where: { organizationId: orgId, cameraId: id }, orderBy: { startedAt: "desc" }, take: 20 }),
  ]);
  const logs24 = logs7.filter((l) => new Date(l.checkedAt) >= d1);

  return (
    <div>
      <div className="mb-3"><Link href="/cctv/cameras" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> กลับ</Link></div>
      <PageHeader title={cam.name ?? `Channel ${cam.channel}`} description={`${cam.recorder.name} · ช่อง ${cam.channel} · ${cam.recorder.project ?? ""} ${cam.recorder.site ?? ""}`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Video className="h-4 w-4" /> สถานะ / Status</CardTitle></CardHeader>
          <CardContent>
            <Row label="กล้อง / Camera"><StatusBadge status={cam.status} /></Row>
            <Row label="เครื่องบันทึก / Recorder"><StatusBadge status={cam.recorder.status} /></Row>
            <Row label="การบันทึก / Recording"><StatusBadge status={cam.recordingStatus} /></Row>
            <Row label="บันทึกล่าสุด">{timeAgo(cam.latestRecordingAt)}</Row>
            <Row label="บันทึกเก่าสุด">{cam.earliestRecordingAt ? new Date(cam.earliestRecordingAt).toLocaleString("th-TH") : "—"}</Row>
            <Row label="เก็บย้อนหลัง">{formatRetention(cam.retentionDays, cam.retentionEstimated)}</Row>
            <Row label="Recording gap">{cam.recordingGapSeconds != null ? `${Math.round(cam.recordingGapSeconds / 60)} นาที` : "—"}</Row>
            <Row label="ออฟไลน์ตั้งแต่">{timeAgo(cam.offlineSince)}</Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Snapshot & Uptime</CardTitle></CardHeader>
          <CardContent>
            <Row label="Snapshot ล่าสุด">{timeAgo(cam.lastSnapshotAt)}</Row>
            <Row label="ขนาดภาพ">{cam.lastSnapshotW && cam.lastSnapshotH ? `${cam.lastSnapshotW}×${cam.lastSnapshotH}` : "—"}</Row>
            <Row label="Uptime 24 ชม.">{uptimePct(logs24)}</Row>
            <Row label="Uptime 7 วัน">{uptimePct(logs7)}</Row>
            <Row label="จำนวนตรวจสอบ (7วัน)">{logs7.length}</Row>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">เหตุการณ์ 24 ชม. / Events</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>เวลา</TableHead><TableHead>สถานะ</TableHead><TableHead className="hidden sm:table-cell">Snapshot</TableHead></TableRow></TableHeader>
              <TableBody>
                {events.slice(0, 30).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs text-muted-foreground">{new Date(e.checkedAt).toLocaleTimeString("th-TH")}</TableCell>
                    <TableCell><StatusBadge status={e.cameraStatus} /></TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{e.snapshotStatus ?? "—"}</TableCell>
                  </TableRow>
                ))}
                {events.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลตรวจสอบใน 24 ชม.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">ประวัติเหตุการณ์ / Incidents</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>เรื่อง</TableHead><TableHead>สถานะ</TableHead><TableHead className="hidden sm:table-cell">Downtime</TableHead></TableRow></TableHeader>
              <TableBody>
                {incidents.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-sm">{i.title}<span className="block text-xs text-muted-foreground">{timeAgo(i.startedAt)}</span></TableCell>
                    <TableCell><StatusBadge status={i.status === "RESOLVED" || i.status === "CLOSED" ? "NORMAL" : "CRITICAL"} /></TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">{i.downtimeMinutes != null ? `${i.downtimeMinutes} นาที` : "—"}</TableCell>
                  </TableRow>
                ))}
                {incidents.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground">ไม่มีประวัติเหตุการณ์</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
