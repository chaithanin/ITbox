import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { getCctvSettings } from "@/lib/services/cctv-settings";
import { StatusBadge, formatBytes } from "../../_status";

export const dynamic = "force-dynamic";

export default async function StorageReport() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:view")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const [settings, recorders, logs] = await Promise.all([
    getCctvSettings(orgId),
    prisma.cctvRecorder.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true, project: true } }),
    prisma.cctvStorageLog.findMany({ where: { organizationId: orgId }, orderBy: { checkedAt: "desc" }, take: 1000 }),
  ]);

  // Latest reading per recorder+HDD.
  const latest = new Map<string, (typeof logs)[number]>();
  for (const l of logs) {
    const k = `${l.recorderId}#${l.hddIndex}`;
    if (!latest.has(k)) latest.set(k, l);
  }
  // Aggregate per recorder.
  type Agg = { name: string; project: string | null; cap: number; used: number; free: number; hdds: number; status: string };
  const byRec = new Map<string, Agg>();
  const recMeta = new Map(recorders.map((r) => [r.id, r]));
  const rank = { NORMAL: 0, UNKNOWN: 1, WARNING: 2, CRITICAL: 3, FAILED: 4 } as Record<string, number>;
  for (const l of latest.values()) {
    const meta = recMeta.get(l.recorderId);
    if (!meta) continue;
    const a = byRec.get(l.recorderId) ?? { name: meta.name, project: meta.project, cap: 0, used: 0, free: 0, hdds: 0, status: "NORMAL" };
    a.cap += Number(l.capacityBytes ?? 0n);
    a.used += Number(l.usedBytes ?? 0n);
    a.free += Number(l.freeBytes ?? 0n);
    a.hdds += 1;
    if ((rank[l.status] ?? 1) > (rank[a.status] ?? 1)) a.status = l.status;
    byRec.set(l.recorderId, a);
  }
  const rows = [...byRec.values()].sort((a, b) => (a.project ?? "").localeCompare(b.project ?? "") || a.name.localeCompare(b.name));

  const freePct = (a: Agg) => (a.cap > 0 ? (a.free / a.cap) * 100 : null);
  const effectiveStatus = (a: Agg): string => {
    const p = freePct(a);
    if (a.status === "FAILED" || a.status === "CRITICAL") return "CRITICAL";
    if (p != null && p < settings.hddCriticalFreePercent) return "CRITICAL";
    if (p != null && p < settings.hddWarnFreePercent) return "WARNING";
    return a.status;
  };

  return (
    <div>
      <PageHeader title="รายงาน Storage / HDD" description={`เกณฑ์ว่าง: เตือน < ${settings.hddWarnFreePercent}% · วิกฤต < ${settings.hddCriticalFreePercent}% · ${rows.length} เครื่องบันทึกมีข้อมูล`} />
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden md:table-cell">โครงการ</TableHead>
              <TableHead>เครื่องบันทึก</TableHead>
              <TableHead>HDD</TableHead>
              <TableHead>ความจุรวม</TableHead>
              <TableHead className="hidden sm:table-cell">ใช้ไป</TableHead>
              <TableHead>คงเหลือ</TableHead>
              <TableHead>ว่าง %</TableHead>
              <TableHead>สถานะ</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => {
              const p = freePct(a);
              return (
                <TableRow key={a.name}>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{a.project ?? "—"}</TableCell>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>{a.hdds}</TableCell>
                  <TableCell>{formatBytes(a.cap)}</TableCell>
                  <TableCell className="hidden sm:table-cell">{formatBytes(a.used)}</TableCell>
                  <TableCell>{formatBytes(a.free)}</TableCell>
                  <TableCell className="text-xs">{p == null ? "—" : `${p.toFixed(1)}%`}</TableCell>
                  <TableCell><StatusBadge status={effectiveStatus(a)} /></TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">ยังไม่มีข้อมูล HDD — collector จะส่งเมื่อเชื่อมต่อเครื่องบันทึก</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
