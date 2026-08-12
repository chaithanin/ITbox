import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { vaultVisibilityWhere } from "@/lib/services/vault";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { StatCard } from "@/components/stat-card";
import { VaultGrid } from "./vault-list";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("vault:read");
  const sp = await searchParams;
  const { page, skip, take } = parsePage(sp.page, 24);

  const visibility = await vaultVisibilityWhere(user);
  const where: Prisma.VaultItemWhereInput = {
    AND: [
      visibility,
      sp.q
        ? {
            OR: [
              { name: { contains: sp.q, mode: "insensitive" } },
              { username: { contains: sp.q, mode: "insensitive" } },
              { host: { contains: sp.q, mode: "insensitive" } },
              { url: { contains: sp.q, mode: "insensitive" } },
              { tags: { has: sp.q } },
            ],
          }
        : {},
      sp.categoryId ? { categoryId: sp.categoryId } : {},
      sp.classification
        ? { classification: sp.classification as never }
        : {},
      sp.type ? { type: sp.type as never } : {},
    ],
  };

  const metadataSelect = {
    id: true, name: true, type: true, classification: true, environment: true,
    username: true, host: true, url: true, nextRotationAt: true, expiresAt: true,
    category: { select: { name: true } },
    department: { select: { name: true } },
    owner: { select: { name: true } },
  } satisfies Prisma.VaultItemSelect;

  const now = new Date();
  const [items, total, categories, favorites, dueCount, expiredCount] = await Promise.all([
    prisma.vaultItem.findMany({
      where,
      select: metadataSelect,
      orderBy: { updatedAt: "desc" },
      skip,
      take,
    }),
    prisma.vaultItem.count({ where }),
    prisma.vaultCategory.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.vaultFavorite.findMany({ where: { userId: user.id }, select: { vaultItemId: true } }),
    prisma.vaultItem.count({ where: { AND: [visibility, { nextRotationAt: { lt: now } }] } }),
    prisma.vaultItem.count({ where: { AND: [visibility, { expiresAt: { lt: now } }] } }),
  ]);

  const favSet = new Set(favorites.map((f) => f.vaultItemId));

  return (
    <div>
      <PageHeader
        title="ตู้เซฟรหัสผ่าน / Password Vault"
        description="ข้อมูลลับถูกเข้ารหัสแบบ AES-256-GCM + Cloud KMS ทุกการเข้าถึงถูกบันทึก"
      >
        {user.permissions.has("vault:create") && (
          <Button asChild>
            <Link href="/vault/new">
              <Plus className="h-4 w-4" /> เพิ่มรหัสผ่าน / New Secret
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="ทั้งหมด / Total" value={total} />
        <StatCard label="ถึงรอบเปลี่ยน / Rotation due" value={dueCount} tone={dueCount ? "warning" : "default"} href="/vault/rotation" />
        <StatCard label="หมดอายุ / Expired" value={expiredCount} tone={expiredCount ? "danger" : "default"} />
        <StatCard label="รายการโปรด / Favorites" value={favSet.size} href="/vault/favorites" />
      </div>

      <SearchFilterBar
        action="/vault"
        q={sp.q}
        placeholder="ค้นหาชื่อ, username, host... / Search"
        filters={[
          {
            name: "categoryId",
            value: sp.categoryId,
            allLabel: "ทุกหมวดหมู่ / All categories",
            options: categories.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            name: "classification",
            value: sp.classification,
            allLabel: "ทุกระดับ / All levels",
            options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((c) => ({ value: c, label: c })),
          },
        ]}
      />

      <VaultGrid items={items.map((i) => ({ ...i, isFavorite: favSet.has(i.id) }))} />
      <Pagination page={page} pageCount={Math.ceil(total / take)} basePath="/vault" searchParams={sp} />
    </div>
  );
}
