import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const user = await requireUser();

  if (!user.permissions.has("security:read")) {
    return (
      <div>
        <PageHeader title="ศูนย์ความปลอดภัย / Security Center" />
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (ต้องมีสิทธิ์ security:read) / You do not have access to
            this page (requires security:read).
          </CardContent>
        </Card>
      </div>
    );
  }

  const orgId = user.organizationId;
  const now = new Date();
  const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ago30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ago90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const failedLoginWhere = {
    organizationId: orgId,
    action: "LOGIN",
    result: { in: ["FAILED", "DENIED"] },
  };

  const [
    failed24h,
    failed7d,
    lockedUsers,
    noMfaCount,
    noMfaUsers,
    inactiveUsers,
    criticalSecrets,
    expiredSecrets,
    rotationOverdue,
    emergencyRequests,
    topAccessGroups,
    activeSessions,
  ] = await Promise.all([
    prisma.auditLog.count({ where: { ...failedLoginWhere, createdAt: { gte: ago24h } } }),
    prisma.auditLog.count({ where: { ...failedLoginWhere, createdAt: { gte: ago7d } } }),
    prisma.user.findMany({
      where: { organizationId: orgId, deletedAt: null, lockedUntil: { gt: now } },
      select: { id: true, name: true, email: true, lockedUntil: true },
      orderBy: { lockedUntil: "desc" },
      take: 10,
    }),
    prisma.user.count({
      where: { organizationId: orgId, deletedAt: null, status: "ACTIVE", mfaEnabled: false },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId, deletedAt: null, status: "ACTIVE", mfaEnabled: false },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 10,
    }),
    prisma.user.count({
      where: {
        organizationId: orgId,
        deletedAt: null,
        status: "ACTIVE",
        OR: [{ lastLoginAt: { lt: ago90d } }, { lastLoginAt: null }],
      },
    }),
    // Vault metrics — counts on metadata only, no secret fields ever selected
    prisma.vaultItem.count({
      where: { organizationId: orgId, deletedAt: null, classification: "CRITICAL" },
    }),
    prisma.vaultItem.count({
      where: { organizationId: orgId, deletedAt: null, expiresAt: { lt: now } },
    }),
    prisma.vaultItem.count({
      where: { organizationId: orgId, deletedAt: null, nextRotationAt: { lt: now } },
    }),
    prisma.vaultEmergencyRequest.findMany({
      where: { organizationId: orgId, createdAt: { gte: ago30d } },
      select: {
        id: true,
        status: true,
        reason: true,
        createdAt: true,
        requester: { select: { name: true } },
        vaultItem: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.vaultAccessLog.groupBy({
      by: ["userId"],
      where: { organizationId: orgId, createdAt: { gte: ago7d } },
      _count: { userId: true },
      orderBy: { _count: { userId: "desc" } },
      take: 5,
    }),
    prisma.userSession.count({
      where: {
        revokedAt: null,
        expiresAt: { gt: now },
        user: { organizationId: orgId },
      },
    }),
  ]);

  const topUserIds = topAccessGroups.map((g) => g.userId);
  const topUsers = topUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: topUserIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const topUserMap = new Map(topUsers.map((u) => [u.id, u]));
  const maxAccess = Math.max(...topAccessGroups.map((g) => g._count.userId), 1);

  return (
    <div>
      <PageHeader
        title="ศูนย์ความปลอดภัย / Security Center"
        description="ภาพรวมความปลอดภัยขององค์กร / Organization security overview"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="ล็อกอินล้มเหลว 24 ชม. / Failed logins (24h)"
          value={failed24h}
          tone={failed24h > 0 ? "danger" : "default"}
          href="/audit-logs?action=LOGIN&result=FAILED"
        />
        <StatCard
          label="ล็อกอินล้มเหลว 7 วัน / Failed logins (7d)"
          value={failed7d}
          tone={failed7d > 0 ? "warning" : "default"}
          href="/audit-logs?action=LOGIN&result=FAILED"
        />
        <StatCard
          label="บัญชีถูกล็อก / Locked accounts"
          value={lockedUsers.length}
          tone={lockedUsers.length > 0 ? "danger" : "default"}
        />
        <StatCard
          label="ไม่มี MFA / Users without MFA"
          value={noMfaCount}
          tone={noMfaCount > 0 ? "warning" : "success"}
        />
        <StatCard
          label="ผู้ใช้ไม่ได้ใช้งาน >90 วัน / Inactive users"
          value={inactiveUsers}
          tone={inactiveUsers > 0 ? "warning" : "default"}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="ความลับระดับวิกฤต / Critical secrets"
          value={criticalSecrets}
          href="/vault"
        />
        <StatCard
          label="ความลับหมดอายุ / Expired secrets"
          value={expiredSecrets}
          tone={expiredSecrets > 0 ? "danger" : "default"}
          href="/vault/rotation"
        />
        <StatCard
          label="เกินกำหนดหมุนเวียน / Rotation overdue"
          value={rotationOverdue}
          tone={rotationOverdue > 0 ? "warning" : "default"}
          href="/vault/rotation"
        />
        <StatCard
          label="เซสชันที่ใช้งานอยู่ / Active sessions"
          value={activeSessions}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Locked accounts */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">บัญชีถูกล็อก / Locked accounts</CardTitle>
            <CardDescription>ผู้ใช้ที่ถูกล็อกจนถึงเวลาที่กำหนด / Users currently locked out</CardDescription>
          </CardHeader>
          <CardContent>
            {lockedUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่มีบัญชีถูกล็อก / No locked accounts</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {lockedUsers.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{u.name}</span>{" "}
                      <span className="text-muted-foreground">{u.email}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      ถึง / until {formatDateTime(u.lockedUntil)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Users without MFA */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              ผู้ใช้ที่ยังไม่เปิด MFA / Users without MFA ({noMfaCount.toLocaleString()})
            </CardTitle>
            <CardDescription>แสดง 10 รายการแรก / Showing first 10</CardDescription>
          </CardHeader>
          <CardContent>
            {noMfaUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ผู้ใช้ทุกคนเปิด MFA แล้ว / All users have MFA enabled
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {noMfaUsers.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3">
                    <span className="font-medium">{u.name}</span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{u.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Emergency access requests */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              คำขอเข้าถึงฉุกเฉิน 30 วัน / Emergency access requests (30d)
            </CardTitle>
            <CardDescription>
              <Link href="/vault/emergency" className="text-primary hover:underline">
                จัดการคำขอ / Manage requests →
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emergencyRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่มีคำขอ / No requests</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {emergencyRequests.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate" title={r.reason}>
                      <span className="font-medium">{r.requester.name}</span>{" "}
                      <span className="text-muted-foreground">→ {r.vaultItem.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <StatusBadge status={r.status} />
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(r.createdAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Excessive secret access */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              การเข้าถึงความลับสูงสุด 7 วัน / Top secret access (7d)
            </CardTitle>
            <CardDescription>
              5 อันดับผู้ใช้ที่เข้าถึง Vault มากที่สุด / Top 5 users by vault access count
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topAccessGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">ไม่มีข้อมูล / No data</p>
            ) : (
              <ul className="space-y-2">
                {topAccessGroups.map((g) => {
                  const u = topUserMap.get(g.userId);
                  const count = g._count.userId;
                  const pct = Math.max(2, Math.round((count / maxAccess) * 100));
                  const label = u ? u.name : g.userId.slice(0, 8) + "…";
                  return (
                    <li
                      key={g.userId}
                      className="flex items-center gap-2 text-sm"
                      title={`${label}: ${count.toLocaleString()}`}
                    >
                      <span className="w-32 shrink-0 truncate text-xs text-muted-foreground" title={u?.email}>
                        {label}
                      </span>
                      <div className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-muted/50">
                        <div
                          className="h-4 rounded bg-primary"
                          style={{ width: `${pct}%` }}
                          title={`${label}: ${count.toLocaleString()}`}
                        />
                      </div>
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums">
                        {count.toLocaleString()}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
