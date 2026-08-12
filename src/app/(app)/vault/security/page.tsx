import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { vaultVisibilityWhere } from "@/lib/services/vault";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Vault security posture — computed from METADATA only (rotation dates,
 * classification, share counts, access logs). Secret values are never
 * decrypted or sent to any third party for these checks.
 */
export default async function VaultSecurityPage() {
  const user = await requirePermission("vault:read");
  const visibility = await vaultVisibilityWhere(user);
  const now = new Date();
  const days180 = new Date(Date.now() - 180 * 86_400_000);

  const [total, overdue, expired, critical, oldSecrets, wideShares, unused] =
    await Promise.all([
      prisma.vaultItem.count({ where: visibility }),
      prisma.vaultItem.count({ where: { AND: [visibility, { nextRotationAt: { lt: now } }] } }),
      prisma.vaultItem.count({ where: { AND: [visibility, { expiresAt: { lt: now } }] } }),
      prisma.vaultItem.findMany({
        where: { AND: [visibility, { classification: "CRITICAL" }] },
        select: { id: true, name: true, lastRotatedAt: true, requireMfaToReveal: true },
        take: 20,
      }),
      prisma.vaultItem.findMany({
        where: { AND: [visibility, { lastRotatedAt: { lt: days180 } }] },
        select: { id: true, name: true, classification: true, lastRotatedAt: true },
        orderBy: { lastRotatedAt: "asc" },
        take: 10,
      }),
      prisma.vaultShare.findMany({
        where: {
          revokedAt: null,
          expiresAt: null,
          vaultItem: { organizationId: user.organizationId, deletedAt: null },
        },
        include: { vaultItem: { select: { id: true, name: true, classification: true } } },
        take: 10,
      }),
      prisma.vaultItem.findMany({
        where: {
          AND: [
            visibility,
            { accessLogs: { none: { createdAt: { gte: days180 } } } },
          ],
        },
        select: { id: true, name: true, classification: true, updatedAt: true },
        take: 10,
      }),
    ]);

  return (
    <div>
      <PageHeader
        title="ความปลอดภัยตู้เซฟ / Vault Security"
        description="วิเคราะห์จาก Metadata เท่านั้น — ระบบไม่ถอดรหัสหรือส่งรหัสผ่านไปตรวจสอบภายนอก"
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="ทั้งหมด / Total" value={total} />
        <StatCard label="เลยรอบเปลี่ยน / Rotation overdue" value={overdue} tone={overdue ? "warning" : "default"} href="/vault/rotation" />
        <StatCard label="หมดอายุ / Expired" value={expired} tone={expired ? "danger" : "default"} />
        <StatCard label="ระดับ Critical" value={critical.length} tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Critical Secrets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {critical.length === 0 && <p className="text-sm text-muted-foreground">ไม่มี / None</p>}
            {critical.map((c) => (
              <Link key={c.id} href={`/vault/${c.id}`} className="flex items-center justify-between rounded-md border p-2.5 text-sm hover:bg-accent">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">
                  MFA {c.requireMfaToReveal ? "✓" : "(บังคับโดยระดับ)"} · rotated {formatDate(c.lastRotatedAt)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>รหัสผ่านเก่า (&gt;180 วัน) / Old Passwords</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {oldSecrets.length === 0 && <p className="text-sm text-muted-foreground">ไม่มี / None</p>}
            {oldSecrets.map((c) => (
              <Link key={c.id} href={`/vault/${c.id}`} className="flex items-center justify-between rounded-md border p-2.5 text-sm hover:bg-accent">
                <span className="font-medium">{c.name}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge status={c.classification} /> {formatDate(c.lastRotatedAt)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>แชร์แบบไม่หมดอายุ / Non-expiring Shares</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {wideShares.length === 0 && <p className="text-sm text-muted-foreground">ไม่มี / None</p>}
            {wideShares.map((s) => (
              <Link key={s.id} href={`/vault/${s.vaultItem.id}`} className="flex items-center justify-between rounded-md border p-2.5 text-sm hover:bg-accent">
                <span className="font-medium">{s.vaultItem.name}</span>
                <span className="flex items-center gap-2 text-xs">
                  <StatusBadge status={s.vaultItem.classification} />
                  <span className="text-muted-foreground">{s.permission}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ไม่ถูกใช้งาน &gt;180 วัน / Unused Secrets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {unused.length === 0 && <p className="text-sm text-muted-foreground">ไม่มี / None</p>}
            {unused.map((c) => (
              <Link key={c.id} href={`/vault/${c.id}`} className="flex items-center justify-between rounded-md border p-2.5 text-sm hover:bg-accent">
                <span className="font-medium">{c.name}</span>
                <StatusBadge status={c.classification} />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
