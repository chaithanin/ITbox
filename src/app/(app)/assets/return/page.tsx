import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { returnAsset } from "../actions";
import { ASSET_CONDITIONS } from "../asset-form-fields";

export default async function ReturnAssetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("asset:return")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  const sp = await searchParams;
  const preselectedAssetId = sp.assetId?.trim() || undefined;

  const assets = await prisma.asset.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      assignments: { some: { status: "CHECKED_OUT" } },
    },
    orderBy: { assetTag: "asc" },
    select: {
      id: true,
      assetTag: true,
      name: true,
      assignments: {
        where: { status: "CHECKED_OUT" },
        orderBy: { assignedAt: "desc" },
        take: 1,
        select: { employee: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="รับคืนทรัพย์สิน / Return Asset"
        description="รับคืนทรัพย์สินจากพนักงาน / Check in an asset from an employee"
      />
      <Card>
        <CardHeader>
          <CardTitle>แบบฟอร์มรับคืน / Check-in Form</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={returnAsset} className="space-y-4">
            <div className="space-y-1.5">
              <Label>ทรัพย์สิน / Asset (ที่ถูกเบิกอยู่ / checked out only) *</Label>
              <Select name="assetId" required defaultValue={preselectedAssetId ?? ""}>
                <option value="" disabled>
                  — เลือกทรัพย์สิน / Select asset —
                </option>
                {assets.map((a) => {
                  const holder = a.assignments[0]?.employee;
                  return (
                    <option key={a.id} value={a.id}>
                      {a.assetTag} — {a.name}
                      {holder ? ` (${holder.firstName} ${holder.lastName})` : ""}
                    </option>
                  );
                })}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>สภาพหลังคืน / Condition After *</Label>
              <Select name="conditionAfter" required defaultValue="GOOD">
                {ASSET_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>บันทึกความเสียหาย / Damage Notes</Label>
              <Textarea name="damageNotes" rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>หมายเหตุ / Remark</Label>
              <Textarea name="remark" rows={3} />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit">รับคืน / Return</Button>
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
