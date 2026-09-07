import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PositionFields } from "../position-fields";
import { createPosition } from "../actions";

export default async function NewPositionPage() {
  const user = await requirePermission("permprofile:manage");
  const departments = await prisma.department.findMany({ where: { organizationId: user.organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/positions"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="เพิ่มตำแหน่งงาน / New Position" />
      <form action={createPosition}>
        <Card><CardContent className="pt-4"><PositionFields departments={departments} /></CardContent></Card>
        <div className="mt-4 flex justify-end"><Button type="submit">บันทึก / Save</Button></div>
      </form>
    </div>
  );
}
