import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EVAL_TEMPLATE_LIST } from "@/lib/documents/evaluation-templates";
import { createEvaluation } from "../actions";

export default async function NewEvaluationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("evaluation:manage");
  const sp = await searchParams;

  const employees = await prisma.employee.findMany({
    where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, firstName: true, lastName: true, employeeCode: true, position: true, department: { select: { name: true } } },
    orderBy: [{ firstName: "asc" }],
    take: 500,
  });

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/evaluations"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="สร้างแบบประเมิน / New KPI Assessment" description="เลือกพนักงานและแบบฟอร์มตามตำแหน่ง" />

      {sp.error === "emp" && <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">ไม่พบพนักงาน / Employee not found</div>}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">ข้อมูลการประเมิน / Assessment details</CardTitle></CardHeader>
        <CardContent>
          <form action={createEvaluation} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="employeeId">พนักงาน / Employee <span className="text-destructive">*</span></Label>
              <Select id="employeeId" name="employeeId" required defaultValue="">
                <option value="" disabled>— เลือกพนักงาน / Select —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.firstName} {e.lastName} · {e.employeeCode}{e.department?.name ? ` · ${e.department.name}` : ""}{e.position ? ` · ${e.position}` : ""}
                  </option>
                ))}
              </Select>
              {employees.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่มีพนักงานในระบบ / No active employees</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="template">แบบฟอร์ม / Template <span className="text-destructive">*</span></Label>
              <Select id="template" name="template" required defaultValue="IT_SUPPORT">
                {EVAL_TEMPLATE_LIST.map((t) => (
                  <option key={t.key} value={t.key}>{t.role} — KPI 30/60/90</option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                IT Support วัดจากงาน/SLA/ทักษะ · IT Assistant Manager วัดจาก Infrastructure/Project/Business/AI
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reviewPeriodStart">วันเริ่มงาน / Start date</Label>
                <Input id="reviewPeriodStart" name="reviewPeriodStart" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="probationEndDate">ครบทดลองงาน / Probation end</Label>
                <Input id="probationEndDate" name="probationEndDate" type="date" />
                <p className="text-xs text-muted-foreground">เว้นว่าง = +90 วันจากวันเริ่มงาน</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" asChild><Link href="/evaluations">ยกเลิก / Cancel</Link></Button>
              <Button type="submit" disabled={employees.length === 0}>สร้าง / Create</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
