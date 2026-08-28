import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge, timeAgo } from "../../_status";

export const dynamic = "force-dynamic";

function Stat({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className={`text-xl font-semibold ${bad && value > 0 ? "text-destructive" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default async function DailyReport({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:view")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const day = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? new Date(`${sp.date}T00:00:00`) : new Date();
  const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);

  const [recorders, cameras, newIncidents, recoveredToday, abnormal] = await Promise.all([
    prisma.cctvRecorder.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { status: true } }),
    prisma.cctvCamera.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { status: true, recordingStatus: true } }),
    prisma.cctvIncident.count({ where: { organizationId: orgId, detectedAt: { gte: dayStart, lt: dayEnd } } }),
    prisma.cctvIncident.count({ where: { organizationId: orgId, resolvedAt: { gte: dayStart, lt: dayEnd } } }),
    prisma.cctvCamera.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { in: ["OFFLINE", "VIDEO_LOSS", "STREAM_ERROR", "NETWORK_ERROR", "NO_RECORDING"] } },
      include: { recorder: { select: { name: true, project: true } } },
      take: 500,
    }),
  ]);

  const recOffline = recorders.filter((r) => r.status === "OFFLINE").length;
  const camOffline = cameras.filter((c) => c.status === "OFFLINE" || c.status === "NETWORK_ERROR").length;
  const videoLoss = cameras.filter((c) => c.status === "VIDEO_LOSS").length;
  const noRec = cameras.filter((c) => c.recordingStatus === "NOT_RECORDING" || c.recordingStatus === "NO_RECORDING_FOUND").length;
  const dateLabel = dayStart.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div>
      <PageHeader title="รายงานสุขภาพ CCTV ประจำวัน" description={`ประจำวันที่ ${dateLabel} · สร้างเมื่อ ${new Date().toLocaleString("th-TH")}`}>
        <div className="flex gap-2">
          <a href="/api/cctv/reports/daily?format=xlsx" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">Excel</a>
          <a href="/api/cctv/reports/daily?format=csv" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">CSV</a>
        </div>
      </PageHeader>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">สรุปภาพรวม / Overall Summary</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="เครื่องบันทึก" value={recorders.length} />
          <Stat label="เครื่องออฟไลน์" value={recOffline} bad />
          <Stat label="กล้องทั้งหมด" value={cameras.length} />
          <Stat label="กล้องออฟไลน์" value={camOffline} bad />
          <Stat label="Video Loss" value={videoLoss} bad />
          <Stat label="ไม่บันทึก" value={noRec} bad />
          <Stat label="เหตุการณ์ใหม่วันนี้" value={newIncidents} bad />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">กล้องที่ผิดปกติ / Problem Cameras ({abnormal.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="hidden md:table-cell">โครงการ</TableHead>
                <TableHead>เครื่อง / Ch</TableHead>
                <TableHead>กล้อง</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead className="hidden sm:table-cell">ออฟไลน์ตั้งแต่</TableHead>
                <TableHead className="hidden lg:table-cell">บันทึกล่าสุด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {abnormal.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{c.recorder.project ?? "—"}</TableCell>
                  <TableCell className="text-sm">{c.recorder.name} <span className="text-muted-foreground">/ {c.channel}</span></TableCell>
                  <TableCell className="font-medium">{c.name ?? `Channel ${c.channel}`}</TableCell>
                  <TableCell><StatusBadge status={c.status} /></TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{timeAgo(c.offlineSince)}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(c.latestRecordingAt)}</TableCell>
                </TableRow>
              ))}
              {abnormal.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">ไม่มีกล้องผิดปกติ 🎉 · กู้คืนวันนี้ {recoveredToday} เหตุการณ์</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
