import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getVaultAccess } from "@/lib/services/vault";
import { PageHeader } from "@/components/page-header";
import { SecretForm } from "../../secret-form";
import { updateSecretAction } from "../../actions";

export default async function EditSecretPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("vault:update");
  const { id } = await params;
  const item = await prisma.vaultItem.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!item) notFound();
  const access = await getVaultAccess(user, item);
  if (access.level < 4) notFound();

  const [categories, departments] = await Promise.all([
    prisma.vaultCategory.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.department.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
    }),
  ]);

  const action = updateSecretAction.bind(null, item.id);

  return (
    <div>
      <PageHeader title={`แก้ไข / Edit: ${item.name}`} />
      <SecretForm
        action={action}
        item={item}
        categories={categories}
        departments={departments}
        submitLabel="บันทึกการแก้ไข / Save changes"
        cancelHref={`/vault/${item.id}`}
      />
    </div>
  );
}
