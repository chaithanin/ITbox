import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateOrganizationAction } from "./actions";

export const dynamic = "force-dynamic";

const MESSAGES: Record<string, { text: string; error?: boolean }> = {
  saved: { text: "บันทึกข้อมูลองค์กรแล้ว / Organization saved" },
  invalid: { text: "ข้อมูลไม่ถูกต้อง / Invalid input", error: true },
  logo: { text: "Logo URL ไม่ถูกต้อง / Invalid logo URL", error: true },
};

export default async function OrganizationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("settings:manage");
  const sp = await searchParams;
  const msg = MESSAGES[sp.ok ?? sp.error ?? ""];

  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: user.organizationId },
    select: { name: true, slug: true, taxId: true, address: true, logoUrl: true },
  });

  return (
    <div>
      <PageHeader
        title="ข้อมูลองค์กร / Organization"
        description="ชื่อบริษัท เลขผู้เสียภาษี ที่อยู่ และโลโก้ — ใช้แสดงทั่วทั้งระบบ"
      >
        <Button variant="outline" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
            กลับไปหน้าตั้งค่า / Back to Settings
          </Link>
        </Button>
      </PageHeader>

      {msg && (
        <p className={`mb-4 rounded-md px-3 py-2 text-sm ${msg.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {msg.text}
        </p>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-sm">รายละเอียดองค์กร / Organization details</CardTitle>
          <CardDescription>
            รหัสองค์กร (slug): <span className="font-mono">{org.slug}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateOrganizationAction} className="grid gap-4">
            <div>
              <Label htmlFor="name">ชื่อบริษัท / Company name *</Label>
              <Input id="name" name="name" required className="mt-1" defaultValue={org.name} />
            </div>
            <div>
              <Label htmlFor="taxId">เลขประจำตัวผู้เสียภาษี / Tax ID</Label>
              <Input id="taxId" name="taxId" className="mt-1" defaultValue={org.taxId ?? ""} />
            </div>
            <div>
              <Label htmlFor="address">ที่อยู่ / Address</Label>
              <Textarea id="address" name="address" rows={2} className="mt-1" defaultValue={org.address ?? ""} />
            </div>
            <div>
              <Label htmlFor="logoUrl">โลโก้ (URL) / Logo URL</Label>
              <Input id="logoUrl" name="logoUrl" className="mt-1" placeholder="https://.../logo.png" defaultValue={org.logoUrl ?? ""} />
            </div>
            <div>
              <Button type="submit">บันทึก / Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
