import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getCctvSettings, gapStatus } from "@/lib/services/cctv-settings";
import { timeAgo } from "../../_status";

export const dynamic = "force-dynamic";

function GapBadge({ status }: { status: string }) {
  const v = status === "NORMAL" ? "success" : status === "WARNING" ? "warning" : status === "CRITICAL" ? "destructive" : "secondary";
  return <Badge variant={v}>{status}</Badge>;
}

function fmtGap(sec?: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec} วิ`;
  if (sec < 3600) return `${Math.round(sec / 60)} นาที`;
  return `${Math.floor(sec / 3600)} ชม. ${Math.round((sec % 3600) / 60)} นาที`;
}

export default async function GapReport() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:view")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const settings = await getCctvSettings(orgId);
  const cameras = await prisma.cctvCamera.findMany({
    where: { organizationId: orgId, deletedAt: null },
    orderBy: [{ recordingGapSeconds: "desc" }],
    include: { recorder: { select: { name: true, project: true } } },
    take: 2000,
  });
  // Only cameras with a WARNING/CRITICAL gap or no recording found (spec §48 — don't claim a gap without data).
  const flagged = cameras
    .map((c) => ({ c, status: gapStatus(c.recordingGapSeconds, settings) }))
    .filter(({ c, status }) => status === "WARNING" || status === "CRITICAL" || c.recordingStatus === "NO_RECORDING_FOUND");

  return (
    <div>
      <PageHeader title="รายงาน Recording Gap" description={`เกณฑ์: เตือน > ${settings.gapWarnMinutes} นาที, วิกฤต > ${settings.gapCriticalMinutes} นาที · พบ ${flagged.length} กล้องผิดปกติ`}>
        <div className="flex gap-2">
          <a href="/api/cctv/reports/gaps?format=xlsx" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">Excel</a>
          <a href="/api/cctv/reports/gaps?format=csv" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">CSV</a>
        </div>
      </PageHeader>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden md:table-cell">โครงการ</TableHead>
              <TableHead>เครื่อง / Ch</TableHead>
              <TableHead>กล้อง</TableHead>
              <TableHead>บันทึกล่าสุด</TableHead>
              <TableHead>Gap</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {flagged.map(({ c, status }) => (
              <TableRow key={c.id}>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{c.recorder.project ?? "—"}</TableCell>
                <TableCell className="text-sm">{c.recorder.name} <span className="text-muted-foreground">/ {c.channel}</span></TableCell>
                <TableCell className="font-medium">{c.name ?? `Channel ${c.channel}`}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.recordingStatus === "NO_RECORDING_FOUND" ? "ไม่พบการบันทึก" : timeAgo(c.latestRecordingAt)}</TableCell>
                <TableCell className="text-xs">{fmtGap(c.recordingGapSeconds)}</TableCell>
                <TableCell><GapBadge status={c.recordingStatus === "NO_RECORDING_FOUND" ? "CRITICAL" : status} /></TableCell>
              </TableRow>
            ))}
            {flagged.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground">ไม่พบกล้องที่มีปัญหาการบันทึก 🎉</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
