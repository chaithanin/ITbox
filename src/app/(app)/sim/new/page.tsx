import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SimFields } from "../sim-fields";
import { createSim } from "../actions";

export default async function NewSimPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("sim:manage");
  const sp = await searchParams;
  const [employees, departments, assetRows] = await Promise.all([
    prisma.employee.findMany({ where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true, employeeCode: true }, orderBy: { employeeCode: "asc" }, take: 1000 }),
    prisma.department.findMany({ where: { organizationId: user.organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.asset.findMany({ where: { organizationId: user.organizationId, deletedAt: null }, select: { id: true, assetTag: true, name: true, category: { select: { name: true } } }, orderBy: { assetTag: "asc" }, take: 2000 }),
  ]);
  const assets = assetRows.map((a) => ({ id: a.id, assetTag: a.assetTag, name: a.name, category: a.category?.name ?? null }));

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/sim"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="เพิ่มเบอร์/ซิม / New SIM Line" description="ลงทะเบียนเบอร์โทร/ซิมใหม่" />
      {sp.error === "duplicate" && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">เบอร์นี้มีอยู่แล้ว / This phone number already exists</div>
      )}
      <form action={createSim}>
        <Card><CardContent className="pt-4"><SimFields employees={employees} departments={departments} assets={assets} /></CardContent></Card>
        <div className="mt-4 flex justify-end"><Button type="submit">บันทึก / Save</Button></div>
      </form>
    </div>
  );
}
