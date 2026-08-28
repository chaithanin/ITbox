import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatusBadge, timeAgo } from "../_status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateCctvIncident } from "../actions";

export const dynamic = "force-dynamic";

export default async function CctvIncidentsPage() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:view")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const canManage = user.permissions.has("cctv:manage");
  const incidents = await prisma.cctvIncident.findMany({
    where: { organizationId: orgId },
    orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    take: 300,
    include: { recorder: { select: { name: true, project: true } }, camera: { select: { channel: true, name: true } } },
  });
  const open = incidents.filter((i) => i.status !== "RESOLVED" && i.status !== "CLOSED");

  return (
    <div>
      <PageHeader title="เหตุการณ์ CCTV / Incidents" description={`ค้างอยู่ ${open.length} · ทั้งหมด ${incidents.length} (ล่าสุด)`} />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ประเภท / Type</TableHead>
              <TableHead className="hidden md:table-cell">โครงการ</TableHead>
              <TableHead>อุปกรณ์</TableHead>
              <TableHead>ความรุนแรง</TableHead>
              <TableHead>สถานะ</TableHead>
              <TableHead className="hidden md:table-cell">เริ่ม</TableHead>
              <TableHead className="hidden lg:table-cell">Downtime</TableHead>
              {canManage && <TableHead className="text-right">จัดการ</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {incidents.map((i) => {
              const active = i.status !== "RESOLVED" && i.status !== "CLOSED";
              return (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.title}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{i.recorder?.project ?? "—"}</TableCell>
                <TableCell className="text-sm">{i.recorder?.name ?? "—"}{i.camera ? <span className="text-muted-foreground"> / ch{i.camera.channel}</span> : null}</TableCell>
                <TableCell><StatusBadge status={i.severity} /></TableCell>
                <TableCell><Badge variant={i.status === "RESOLVED" || i.status === "CLOSED" ? "success" : "destructive"}>{i.status}</Badge></TableCell>
                <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{timeAgo(i.startedAt)}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs">{i.downtimeMinutes != null ? `${i.downtimeMinutes} นาที` : "—"}</TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    {active ? (
                      <div className="flex justify-end gap-1">
                        {i.status === "OPEN" && (
                          <form action={updateCctvIncident}>
                            <input type="hidden" name="incidentId" value={i.id} />
                            <input type="hidden" name="op" value="ack" />
                            <Button type="submit" size="sm" variant="outline">รับเรื่อง</Button>
                          </form>
                        )}
                        <form action={updateCctvIncident}>
                          <input type="hidden" name="incidentId" value={i.id} />
                          <input type="hidden" name="op" value="resolve" />
                          <Button type="submit" size="sm">ปิด</Button>
                        </form>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                )}
              </TableRow>
              );
            })}
            {incidents.length === 0 && (
              <TableRow><TableCell colSpan={canManage ? 8 : 7} className="text-center text-sm text-muted-foreground">ยังไม่มีเหตุการณ์ — ระบบจะสร้างอัตโนมัติเมื่อพบเครื่อง/กล้องออฟไลน์</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
