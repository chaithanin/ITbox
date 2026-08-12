import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { vaultVisibilityWhere } from "@/lib/services/vault";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { formatDate, daysUntil } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RotationPage() {
  const user = await requirePermission("vault:read");
  const visibility = await vaultVisibilityWhere(user);
  const now = new Date();
  const soon = new Date(Date.now() + 14 * 86_400_000);

  const [overdue, dueSoon, expired] = await Promise.all([
    prisma.vaultItem.findMany({
      where: { AND: [visibility, { nextRotationAt: { lt: now } }] },
      select: {
        id: true, name: true, classification: true, nextRotationAt: true,
        lastRotatedAt: true, rotationDays: true,
        category: { select: { name: true } },
      },
      orderBy: { nextRotationAt: "asc" },
      take: 100,
    }),
    prisma.vaultItem.findMany({
      where: { AND: [visibility, { nextRotationAt: { gte: now, lte: soon } }] },
      select: {
        id: true, name: true, classification: true, nextRotationAt: true,
        lastRotatedAt: true, rotationDays: true,
        category: { select: { name: true } },
      },
      orderBy: { nextRotationAt: "asc" },
      take: 100,
    }),
    prisma.vaultItem.count({ where: { AND: [visibility, { expiresAt: { lt: now } }] } }),
  ]);

  const rows = [...overdue, ...dueSoon];

  return (
    <div>
      <PageHeader
        title="รอบเปลี่ยนรหัสผ่าน / Password Rotation"
        description="รายการที่เลยกำหนดหรือใกล้ถึงรอบเปลี่ยนรหัสภายใน 14 วัน"
      />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <StatCard label="เลยกำหนด / Overdue" value={overdue.length} tone={overdue.length ? "danger" : "default"} />
        <StatCard label="ใกล้ถึงรอบ / Due in 14d" value={dueSoon.length} tone={dueSoon.length ? "warning" : "default"} />
        <StatCard label="หมดอายุ / Expired" value={expired} tone={expired ? "danger" : "default"} />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ชื่อ / Name</TableHead>
            <TableHead>หมวดหมู่</TableHead>
            <TableHead>ระดับ</TableHead>
            <TableHead>เปลี่ยนล่าสุด</TableHead>
            <TableHead>กำหนด / Due</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                ไม่มีรายการถึงรอบเปลี่ยนรหัส / Nothing due
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => {
            const d = daysUntil(r.nextRotationAt);
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link href={`/vault/${r.id}`} className="hover:underline">{r.name}</Link>
                </TableCell>
                <TableCell>{r.category?.name ?? "-"}</TableCell>
                <TableCell><StatusBadge status={r.classification} /></TableCell>
                <TableCell>{formatDate(r.lastRotatedAt)}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {formatDate(r.nextRotationAt)}
                    {d !== null && d < 0 ? (
                      <Badge variant="destructive">เลย {Math.abs(d)} วัน</Badge>
                    ) : (
                      <Badge variant="warning">อีก {d} วัน</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <Link href={`/vault/${r.id}`} className="text-sm text-primary hover:underline">
                    จัดการ / Manage
                  </Link>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
