import Link from "next/link";
import { UserPlus, Plus, ListChecks } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { startOnboarding, saveChecklist } from "./actions";

const TASK_LABEL: { key: "accountCreated" | "emailCreated" | "assetAssigned" | "softwareAssigned" | "accessGranted" | "inductionDone"; th: string }[] = [
  { key: "accountCreated", th: "สร้างบัญชีผู้ใช้ / Account" },
  { key: "emailCreated", th: "สร้างอีเมล / Email" },
  { key: "assetAssigned", th: "มอบอุปกรณ์ / Device" },
  { key: "softwareAssigned", th: "ติดตั้งซอฟต์แวร์ / Software" },
  { key: "accessGranted", th: "ให้สิทธิ์เข้าถึง / Access" },
  { key: "inductionDone", th: "ปฐมนิเทศ IT / Induction" },
];

/** Onboarding (Joiner) checklist board — used standalone and inside the Employees tabs. */
export async function OnboardingBoard() {
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("onboarding:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึง Onboarding / No access.</div>;
  }
  const canManage = user.permissions.has("onboarding:manage");
  const orgId = user.organizationId;

  const [active, employeesWithout] = await Promise.all([
    prisma.onboarding.findMany({
      where: { organizationId: orgId, status: { not: "COMPLETED" } },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true, position: true } } },
      orderBy: { createdAt: "desc" },
    }),
    canManage
      ? prisma.employee.findMany({
          where: { organizationId: orgId, deletedAt: null, status: "ACTIVE", onboardings: { none: { status: { not: "COMPLETED" } } } },
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
          orderBy: { createdAt: "desc" }, take: 200,
        })
      : Promise.resolve([]),
  ]);

  return (
    <div>
      {canManage && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4 text-primary" /> เริ่ม Onboarding พนักงานใหม่</CardTitle></CardHeader>
          <CardContent>
            <form action={startOnboarding} className="flex flex-wrap items-end gap-2">
              <Select name="employeeId" required defaultValue="" className="min-w-[240px] flex-1">
                <option value="" disabled>— เลือกพนักงาน / Select employee —</option>
                {employeesWithout.map((e) => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>)}
              </Select>
              <Button type="submit"><UserPlus className="h-4 w-4" /> เริ่ม / Start</Button>
            </form>
            {employeesWithout.length === 0 && <p className="mt-2 text-xs text-muted-foreground">พนักงานที่ ACTIVE ทุกคนมี onboarding อยู่แล้ว หรือยังไม่มีพนักงานใหม่</p>}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {active.length === 0 && <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground lg:col-span-2">ไม่มี onboarding ที่กำลังดำเนินการ</p>}
        {active.map((o) => {
          const done = TASK_LABEL.filter((t) => o[t.key]).length;
          const save = saveChecklist.bind(null, o.id);
          return (
            <Card key={o.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>{o.employee.firstName} {o.employee.lastName} <span className="font-normal text-muted-foreground">({o.employee.employeeCode})</span></span>
                  <Badge variant={done === TASK_LABEL.length ? "success" : "warning"}>{done}/{TASK_LABEL.length}</Badge>
                </CardTitle>
                {o.employee.position && <p className="text-xs text-muted-foreground">{o.employee.position}</p>}
              </CardHeader>
              <CardContent>
                <form action={save} className="space-y-2">
                  {TASK_LABEL.map((t) => (
                    <label key={t.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name={t.key} value="on" defaultChecked={o[t.key]} disabled={!canManage} className="h-4 w-4" />
                      {t.th}
                    </label>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <Button type="button" variant="outline" size="sm" asChild>
                      <Link href={`/onboarding/${o.id}`}><ListChecks className="h-4 w-4" /> กรอกรายละเอียด / Details</Link>
                    </Button>
                    {canManage && <Button type="submit" size="sm">บันทึก / Save</Button>}
                  </div>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
