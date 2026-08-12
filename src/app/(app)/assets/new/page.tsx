import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAsset } from "../actions";
import { AssetFormFields } from "../asset-form-fields";

export default async function NewAssetPage() {
  const user = await requireUser();
  if (!user.permissions.has("asset:create")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  const [categories, departments, locations, vendors] = await Promise.all([
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

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="สร้างทรัพย์สิน / New Asset"
        description="ลงทะเบียนทรัพย์สินใหม่เข้าระบบ / Register a new asset"
      />
      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลทรัพย์สิน / Asset Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAsset} className="space-y-5">
            <AssetFormFields
              categories={categories}
              departments={departments}
              locations={locations}
              vendors={vendors}
            />
            <div className="flex items-center gap-2">
              <Button type="submit">บันทึก / Save</Button>
              <Button variant="outline" asChild>
                <Link href="/assets">ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
