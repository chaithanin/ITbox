import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { SecretForm } from "../secret-form";
import { createSecretAction } from "../actions";

export default async function NewSecretPage() {
  const user = await requirePermission("vault:create");
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

  return (
    <div>
      <PageHeader
        title="เพิ่มรหัสผ่านใหม่ / New Secret"
        description="ข้อมูลลับจะถูกเข้ารหัส AES-256-GCM ด้วย DEK เฉพาะรายการ และห่อกุญแจด้วย Cloud KMS"
      />
      <SecretForm
        action={createSecretAction}
        categories={categories}
        departments={departments}
        submitLabel="บันทึก / Save"
        cancelHref="/vault"
      />
    </div>
  );
}
