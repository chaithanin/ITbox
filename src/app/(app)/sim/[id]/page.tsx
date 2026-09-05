import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmButton } from "@/components/confirm-button";
import { SimFields } from "../sim-fields";
import { updateSim, deleteSim } from "../actions";

export default async function SimDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("sim:read");
  const { id } = await params;
  const sp = await searchParams;
  const canManage = user.permissions.has("sim:manage");

  const sim = await prisma.simCard.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null } });
  if (!sim) notFound();

  const [employees, departments] = await Promise.all([
    prisma.employee.findMany({ where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true, employeeCode: true }, orderBy: { employeeCode: "asc" }, take: 1000 }),
    prisma.department.findMany({ where: { organizationId: user.organizationId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const d = {
    phoneNumber: sim.phoneNumber, carrier: sim.carrier, accountName: sim.accountName, holder: sim.holder,
    employeeId: sim.employeeId, departmentId: sim.departmentId, status: sim.status, simSerial: sim.simSerial,
    plan: sim.plan, monthlyFee: sim.monthlyFee != null ? String(sim.monthlyFee) : null,
    startDate: sim.startDate ? sim.startDate.toISOString().slice(0, 10) : null, notes: sim.notes,
  };

  const update = updateSim.bind(null, sim.id);
  const del = deleteSim.bind(null, sim.id);

  return (
    <div className="mx-auto max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/sim"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title={sim.phoneNumber} description={`${sim.carrier}${sim.accountName ? ` · ${sim.accountName}` : ""}`}>
        {canManage && (
          <form action={del}>
            <ConfirmButton type="submit" variant="destructive" confirmText="ลบเบอร์นี้? / Delete this SIM line?"><Trash2 className="h-4 w-4" /> ลบ / Delete</ConfirmButton>
          </form>
        )}
      </PageHeader>
      {sp.error === "duplicate" && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">เบอร์นี้ซ้ำกับรายการอื่น / Phone number already exists</div>
      )}
      <form action={update}>
        <Card><CardContent className="pt-4"><SimFields d={d} employees={employees} departments={departments} /></CardContent></Card>
        {canManage && <div className="mt-4 flex justify-end"><Button type="submit">บันทึก / Save</Button></div>}
      </form>
    </div>
  );
}
