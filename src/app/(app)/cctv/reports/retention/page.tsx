import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { getCctvSettings, retentionStatus } from "@/lib/services/cctv-settings";
import { formatRetention } from "../../_status";

export const dynamic = "force-dynamic";

function ComplianceBadge({ status }: { status: string }) {
  const v = status === "PASS" ? "success" : status === "WARNING" ? "warning" : status === "CRITICAL" ? "destructive" : "secondary";
  return <Badge variant={v}>{status}</Badge>;
}

export default async function RetentionReport() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("cctv:view")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const orgId = user.organizationId;
  const [settings, cameras] = await Promise.all([
    getCctvSettings(orgId),
    prisma.cctvCamera.findMany({
      where: { organizationId: orgId, deletedAt: null },
      orderBy: [{ recorderId: "asc" }, { channel: "asc" }],
      include: { recorder: { select: { name: true, project: true } } },
      take: 2000,
    }),
  ]);
  const rows = cameras.map((c) => ({ c, status: retentionStatus(c.retentionDays, settings.minRetentionDays) }));
  const counts = { PASS: 0, WARNING: 0, CRITICAL: 0, UNKNOWN: 0 } as Record<string, number>;
  for (const r of rows) counts[r.status]++;

  return (
    <div>
      <PageHeader title="รายงาน Retention Compliance" description={`เกณฑ์ขั้นต่ำ ${settings.minRetentionDays} วัน · PASS ${counts.PASS} · WARNING ${counts.WARNING} · CRITICAL ${counts.CRITICAL} · UNKNOWN ${counts.UNKNOWN}`}>
        <div className="flex gap-2">
          <a href="/api/cctv/reports/retention?format=xlsx" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">Excel</a>
          <a href="/api/cctv/reports/retention?format=csv" className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent">CSV</a>
        </div>
      </PageHeader>
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden md:table-cell">โครงการ</TableHead>
              <TableHead>เครื่อง / Ch</TableHead>
              <TableHead>กล้อง</TableHead>
              <TableHead className="hidden lg:table-cell">เก่าสุด</TableHead>
              <TableHead className="hidden lg:table-cell">ล่าสุด</TableHead>
              <TableHead>เก็บจริง</TableHead>
              <TableHead>ต้องการ</TableHead>
              <TableHead>ผล</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ c, status }) => (
              <TableRow key={c.id}>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{c.recorder.project ?? "—"}</TableCell>
                <TableCell className="text-sm">{c.recorder.name} <span className="text-muted-foreground">/ {c.channel}</span></TableCell>
                <TableCell className="font-medium">{c.name ?? `Channel ${c.channel}`}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs">{c.earliestRecordingAt ? new Date(c.earliestRecordingAt).toLocaleDateString("th-TH") : "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs">{c.latestRecordingAt ? new Date(c.latestRecordingAt).toLocaleDateString("th-TH") : "—"}</TableCell>
                <TableCell className="text-xs">{formatRetention(c.retentionDays, c.retentionEstimated)}</TableCell>
                <TableCell className="text-xs">{settings.minRetentionDays} วัน</TableCell>
                <TableCell><ComplianceBadge status={status} /></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลกล้อง</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
