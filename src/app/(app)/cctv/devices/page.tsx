import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatusBadge, timeAgo } from "../_status";
import { requestRecheck } from "../actions";

export const dynamic = "force-dynamic";

export default async function CctvDevicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:view")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const canManage = user.permissions.has("cctv:manage");
  const recorders = await prisma.cctvRecorder.findMany({
    where: { organizationId: orgId, deletedAt: null },
    orderBy: [{ project: "asc" }, { name: "asc" }],
    include: { _count: { select: { cameras: true } }, asset: { select: { assetTag: true } } },
  });

  const notice = sp.imported != null
    ? `นำเข้าสำเร็จ: สร้าง ${sp.imported} · อัปเดต ${sp.updated ?? 0} · ผูกทรัพย์สิน ${sp.linked ?? 0}`
    : null;

  return (
    <div>
      <PageHeader title="เครื่องบันทึก / Recorders" description={`ทะเบียนเครื่องบันทึก CCTV ทั้งหมด ${recorders.length} เครื่อง`} />
      {notice && <div className="mb-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{notice}</div>}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เครื่อง / Recorder</TableHead>
              <TableHead className="hidden md:table-cell">โครงการ</TableHead>
              <TableHead className="hidden lg:table-cell">Serial</TableHead>
              <TableHead className="hidden lg:table-cell">รุ่น / Model</TableHead>
              <TableHead>ช่อง</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="hidden md:table-cell">เห็นล่าสุด</TableHead>
              <TableHead className="hidden xl:table-cell">ทรัพย์สิน</TableHead>
              {canManage && <TableHead className="text-right">Check Now</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {recorders.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.name}{r.site ? <span className="block text-xs text-muted-foreground">{r.site}</span> : null}</TableCell>
                <TableCell className="hidden md:table-cell">{r.project ?? "—"}</TableCell>
                <TableCell className="hidden lg:table-cell font-mono text-xs">{r.serial}</TableCell>
                <TableCell className="hidden lg:table-cell">{r.model ?? "—"}</TableCell>
                <TableCell>{r._count.cameras || r.channelCount || "—"}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{timeAgo(r.lastSeenAt)}</TableCell>
                <TableCell className="hidden xl:table-cell">{r.asset ? <Badge variant="outline">{r.asset.assetTag}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    {r.recheckRequestedAt ? (
                      <span className="text-xs text-amber-600 dark:text-amber-400">รอตรวจ…</span>
                    ) : (
                      <form action={requestRecheck}>
                        <input type="hidden" name="recorderId" value={r.id} />
                        <Button type="submit" size="sm" variant="outline">Check Now</Button>
                      </form>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {recorders.length === 0 && (
              <TableRow><TableCell colSpan={canManage ? 9 : 8} className="text-center text-sm text-muted-foreground">ยังไม่มีเครื่องบันทึก — นำเข้า device.xml เพื่อเริ่มต้น</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
