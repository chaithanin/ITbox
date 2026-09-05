import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { accessSystems } from "@/lib/documents/access-profile";
import { ProfileFields } from "../profile-fields";
import { ProfileItemsEditor } from "../items-editor";
import { createProfile } from "../actions";

export default async function NewProfilePage() {
  const user = await requirePermission("permprofile:manage");
  const departments = await prisma.department.findMany({ where: { organizationId: user.organizationId, deletedAt: null }, select: { name: true }, orderBy: { name: "asc" } });
  const systems = accessSystems();

  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/settings/permission-profiles"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="สร้างโปรไฟล์สิทธิ์ / New Permission Profile" description="กำหนดเงื่อนไข (แผนก/ตำแหน่ง/ระดับ) และสิทธิ์มาตรฐาน" />
      <form action={createProfile} className="space-y-4">
        <Card><CardContent className="pt-4"><ProfileFields departments={departments} /></CardContent></Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">สิทธิ์มาตรฐาน / Default permissions</CardTitle></CardHeader>
          <CardContent><ProfileItemsEditor systems={systems} initial={[]} /></CardContent>
        </Card>
        <div className="flex justify-end"><Button type="submit">บันทึก / Save</Button></div>
      </form>
    </div>
  );
}
