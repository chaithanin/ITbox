import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { PageHeader } from "@/components/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge, formatRetention, timeAgo } from "../_status";

export const dynamic = "force-dynamic";

export default async function CctvCamerasPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:view")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const onlyProblem = sp.filter === "offline";

  const where: Prisma.CctvCameraWhereInput = {
    organizationId: orgId, deletedAt: null,
    ...(onlyProblem ? { status: { in: ["OFFLINE", "VIDEO_LOSS", "STREAM_ERROR", "NETWORK_ERROR", "NO_RECORDING"] } } : {}),
  };
  const cameras = await prisma.cctvCamera.findMany({
    where,
    orderBy: [{ recorderId: "asc" }, { channel: "asc" }],
    include: { recorder: { select: { name: true, project: true } } },
    take: 1000,
  });

  return (
    <div>
      <PageHeader
        title={onlyProblem ? "กล้องที่มีปัญหา / Problem Cameras" : "กล้องทั้งหมด / Cameras"}
        description={`${cameras.length} ช่อง${onlyProblem ? " (เฉพาะที่มีปัญหา)" : ""}`}
      />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden md:table-cell">โครงการ</TableHead>
              <TableHead>เครื่อง / Ch</TableHead>
              <TableHead>กล้อง</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="hidden md:table-cell">บันทึก</TableHead>
              <TableHead className="hidden lg:table-cell">บันทึกล่าสุด</TableHead>
              <TableHead className="hidden xl:table-cell">เก็บย้อนหลัง</TableHead>
              <TableHead className="hidden lg:table-cell">Snapshot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cameras.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{c.recorder.project ?? "—"}</TableCell>
                <TableCell className="text-sm">{c.recorder.name} <span className="text-muted-foreground">/ {c.channel}</span></TableCell>
                <TableCell className="font-medium">{c.name ?? `Channel ${c.channel}`}</TableCell>
                <TableCell><StatusBadge status={c.status} /></TableCell>
                <TableCell className="hidden md:table-cell"><StatusBadge status={c.recordingStatus} /></TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(c.latestRecordingAt)}</TableCell>
                <TableCell className="hidden xl:table-cell text-xs">{formatRetention(c.retentionDays, c.retentionEstimated)}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{timeAgo(c.lastSnapshotAt)}</TableCell>
              </TableRow>
            ))}
            {cameras.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">ไม่มีข้อมูลกล้อง — collector จะเติมข้อมูลเมื่อเชื่อมต่อเครื่องบันทึก</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
