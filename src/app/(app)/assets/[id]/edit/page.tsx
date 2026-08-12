import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateAsset } from "../../actions";
import { AssetFormFields } from "../../asset-form-fields";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("asset:update")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [asset, categories, departments, locations, vendors] = await Promise.all([
    prisma.asset.findFirst({
      where: { id, organizationId: user.organizationId, deletedAt: null },
    }),
    prisma.assetCategory.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.department.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.location.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.vendor.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!asset) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`แก้ไขทรัพย์สิน / Edit Asset — ${asset.assetTag}`}
        description={asset.name}
      />
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลทรัพย์สิน / Asset Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateAsset} className="space-y-5">
            <input type="hidden" name="id" value={asset.id} />
            <AssetFormFields
              asset={asset}
              categories={categories}
              departments={departments}
              locations={locations}
              vendors={vendors}
            />
            <div className="flex items-center gap-2">
              <Button type="submit">บันทึก / Save</Button>
              <Button variant="outline" asChild>
                <Link href={`/assets/${asset.id}`}>ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
