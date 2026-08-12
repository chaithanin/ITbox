import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { vaultVisibilityWhere } from "@/lib/services/vault";
import { PageHeader } from "@/components/page-header";
import { VaultGrid } from "../vault-list";

export const dynamic = "force-dynamic";

export default async function FavoriteSecretsPage() {
  const user = await requirePermission("vault:read");
  const visibility = await vaultVisibilityWhere(user);
  const items = await prisma.vaultItem.findMany({
    where: {
      AND: [visibility, { favorites: { some: { userId: user.id } } }],
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
      <PageHeader title="รายการโปรด / Favorites" />
      <VaultGrid items={items.map((i) => ({ ...i, isFavorite: true }))} />
    </div>
  );
}
