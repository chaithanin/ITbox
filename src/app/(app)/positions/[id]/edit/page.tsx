import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { PositionFields } from "../../position-fields";
import { updatePosition, deletePosition } from "../../actions";

export default async function EditPositionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("permprofile:manage");
  const { id } = await params;
  const p = await prisma.position.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null } });
  if (!p) notFound();
  const departments = await prisma.department.findMany({ where: { organizationId: user.organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const update = updatePosition.bind(null, p.id);
  const del = deletePosition.bind(null, p.id);
  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/positions"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title={`แก้ไขตำแหน่ง / Edit — ${p.name}`}>
        <form action={del}><ConfirmButton type="submit" variant="destructive" confirmText="ลบตำแหน่งนี้? / Delete this position?"><Trash2 className="h-4 w-4" /> ลบ</ConfirmButton></form>
      </PageHeader>
      <form action={update}>
        <Card><CardContent className="pt-4"><PositionFields d={{ name: p.name, code: p.code, departmentId: p.departmentId, jobLevel: p.jobLevel, isActive: p.isActive }} departments={departments} /></CardContent></Card>
        <div className="mt-4 flex justify-end"><Button type="submit">บันทึก / Save</Button></div>
      </form>
    </div>
  );
}
