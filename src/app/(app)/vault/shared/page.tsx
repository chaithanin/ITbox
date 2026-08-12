import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { VaultGrid } from "../vault-list";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function SharedSecretsPage() {
  const user = await requirePermission("vault:read");
  const employee = user.employeeId
    ? await prisma.employee.findUnique({
        where: { id: user.employeeId },
        select: { departmentId: true },
      })
    : null;
  const now = new Date();
  const activeShare: Prisma.VaultShareWhereInput = {
    revokedAt: null,
    startsAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };

  const items = await prisma.vaultItem.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      ownerId: { not: user.id },
      OR: [
        { shares: { some: { ...activeShare, userId: user.id } } },
        ...(user.roles.length
          ? [{ shares: { some: { ...activeShare, role: { key: { in: user.roles } } } } }]
          : []),
        ...(employee?.departmentId
          ? [{ shares: { some: { ...activeShare, departmentId: employee.departmentId } } }]
          : []),
      ],
    },
    select: {
      id: true, name: true, type: true, classification: true, environment: true,
      username: true, host: true, url: true, nextRotationAt: true, expiresAt: true,
      category: { select: { name: true } },
      department: { select: { name: true } },
      owner: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div>
      <PageHeader
        title="แชร์ถึงฉัน / Shared With Me"
        description="รายการที่ผู้อื่นแชร์ให้คุณ (รวมผ่านบทบาทและแผนก) — สิทธิ์หมดอายุอัตโนมัติ"
      />
      <VaultGrid items={items} />
    </div>
  );
}
