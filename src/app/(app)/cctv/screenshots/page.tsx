import Link from "next/link";
import { Camera, ImageOff } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, timeAgo } from "../_status";

export const dynamic = "force-dynamic";

/**
 * Screenshot dashboard (grid). The collector saves snapshots on-prem and reports
 * their metadata (status, time, dimensions); image bytes are not uploaded in
 * Phase 1/2, so each tile shows the latest snapshot's status and freshness with a
 * link to the camera. (Uploading the actual JPEG is a later enhancement.)
 */
export default async function ScreenshotGrid() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:view")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const cameras = await prisma.cctvCamera.findMany({
    where: { organizationId: orgId, deletedAt: null },
    orderBy: [{ lastSnapshotAt: { sort: "desc", nulls: "last" } }],
    include: { recorder: { select: { name: true, project: true } } },
    take: 600,
  });

  return (
    <div>
      <PageHeader title="Screenshot Dashboard" description={`ภาพล่าสุดต่อกล้อง ${cameras.length} ช่อง (สถานะ + เวลา — คลิกเพื่อดูรายละเอียด)`} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {cameras.map((c) => {
          const fresh = c.lastSnapshotAt && Date.now() - new Date(c.lastSnapshotAt).getTime() < 2 * 3600 * 1000;
          return (
            <Link key={c.id} href={`/cctv/cameras/${c.id}`} className="group rounded-lg border overflow-hidden hover:border-primary">
              <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">
                {c.snapshotObjectKey ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/cctv/snapshot/${c.id}`} alt={c.name ?? `ch${c.channel}`} className="h-full w-full object-cover" />
                ) : fresh ? <Camera className="h-8 w-8 opacity-60" /> : <ImageOff className="h-8 w-8 opacity-40" />}
              </div>
              <div className="space-y-1 p-2">
                <div className="truncate text-sm font-medium">{c.name ?? `Ch ${c.channel}`}</div>
                <div className="truncate text-xs text-muted-foreground">{c.recorder.name}</div>
                <div className="flex items-center justify-between">
                  <StatusBadge status={c.status} />
                  <span className="text-[10px] text-muted-foreground">{timeAgo(c.lastSnapshotAt)}</span>
                </div>
              </div>
            </Link>
          );
        })}
        {cameras.length === 0 && <div className="col-span-full rounded-lg border p-8 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลกล้อง</div>}
      </div>
    </div>
  );
}
