import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { MessageBanner } from "../message-banner";
import { upsertSlaPolicy } from "../actions";
import type { CasePriority } from "@prisma/client";

export const dynamic = "force-dynamic";

const PRIORITIES: { key: CasePriority; label: string; fr: number; res: number }[] = [
  { key: "P1", label: "วิกฤต / Critical", fr: 15, res: 240 },
  { key: "P2", label: "สูง / High", fr: 30, res: 480 },
  { key: "P3", label: "ปกติ / Normal", fr: 240, res: 2880 },
  { key: "P4", label: "ต่ำ / Low", fr: 480, res: 7200 },
];

function humanMins(m: number): string {
  if (m % 1440 === 0) return `${m / 1440} วัน`;
  if (m % 60 === 0) return `${m / 60} ชม.`;
  return `${m} นาที`;
}

export default async function SlaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("support:settings");
  const sp = await searchParams;
  const policies = await prisma.slaPolicy.findMany({ where: { organizationId: user.organizationId } });
  const byPriority = new Map(policies.map((p) => [p.priority, p]));

  return (
    <div>
      <PageHeader title="ความเร่งด่วน & SLA / Priority & SLA" description="กำหนดเวลาตอบสนองและแก้ไขต่อระดับความเร่งด่วน">
        <Button variant="outline" asChild><Link href="/settings/support">← กลับ / Back</Link></Button>
      </PageHeader>
      <MessageBanner ok={sp.ok} error={sp.error} />

      <div className="grid gap-4 lg:grid-cols-2">
        {PRIORITIES.map((p) => {
          const cur = byPriority.get(p.key);
          return (
            <Card key={p.key}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2"><StatusBadge status={p.key} /> {p.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <form action={upsertSlaPolicy} className="space-y-3">
                  <input type="hidden" name="priority" value={p.key} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>First Response (นาที)</Label>
                      <Input name="firstResponseMins" type="number" min={1} required defaultValue={cur?.firstResponseMins ?? p.fr} />
                      <p className="text-xs text-muted-foreground">แนะนำ {humanMins(p.fr)}</p>
                    </div>
                    <div className="space-y-1">
                      <Label>Resolution (นาที)</Label>
                      <Input name="resolutionMins" type="number" min={1} required defaultValue={cur?.resolutionMins ?? p.res} />
                      <p className="text-xs text-muted-foreground">แนะนำ {humanMins(p.res)}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>เตือนก่อน SLA (นาที) / Warn before</Label>
                    <Input name="warnBeforeMins" type="number" min={0} defaultValue={cur?.warnBeforeMins ?? 15} />
                  </div>
                  <div className="space-y-1">
                    <Label>Escalate เมื่อเกิน SLA / Escalate to</Label>
                    <Select name="escalateToRoleKey" defaultValue={cur?.escalateToRoleKey ?? ""}>
                      <option value="">— ไม่ระบุ —</option>
                      <option value="IT_MANAGER">IT Manager</option>
                      <option value="SECURITY_ADMIN">Security Admin</option>
                      <option value="ADMIN">Admin</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="pauseOnWaitingUser" defaultChecked={cur?.pauseOnWaitingUser ?? true} className="h-4 w-4 rounded border-input" />
                      หยุด SLA เมื่อรอผู้ใช้ / Pause on Waiting-User
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="pauseOnWaitingVendor" defaultChecked={cur?.pauseOnWaitingVendor ?? true} className="h-4 w-4 rounded border-input" />
                      หยุด SLA เมื่อรอผู้ขาย / Pause on Waiting-Vendor
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="businessHoursOnly" defaultChecked={cur?.businessHoursOnly ?? (p.key === "P3" || p.key === "P4")} className="h-4 w-4 rounded border-input" />
                      นับเฉพาะเวลาทำการ / Business hours only
                    </label>
                  </div>
                  <Button type="submit" size="sm" className="w-full">บันทึก {p.key} / Save</Button>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-4">
        <CardHeader><CardTitle>Workflow อ้างอิง / Reference</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p className="font-mono text-xs leading-6">
            NEW → TRIAGE → ASSIGNED → IN_PROGRESS → (WAITING_USER | WAITING_VENDOR) → RESOLVED → CLOSED<br />
            &nbsp;&nbsp;↘ REOPENED ↗ &nbsp;&nbsp; CANCELLED · DUPLICATE
          </p>
          <ul className="mt-2 list-inside list-disc">
            <li>ผู้ใช้ตอบกลับเคสที่ &quot;รอผู้ใช้&quot; → กลับเป็น IN_PROGRESS อัตโนมัติ</li>
            <li>เคส P1 ปิด/แก้ไขไม่ได้ถ้าไม่มี Resolution Note</li>
            <li>เปิดเคสที่ปิดแล้วใหม่ (REOPENED) ต้องมีสิทธิ์ support:manage</li>
            <li>WAITING_USER / WAITING_VENDOR หยุดนับ SLA ตามการตั้งค่าด้านบน</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
