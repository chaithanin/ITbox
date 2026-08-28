import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { transitionChange } from "../actions";
import type { ChangeStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const NEXT: Record<ChangeStatus, ChangeStatus[]> = {
  DRAFT: ["SUBMITTED"], SUBMITTED: ["APPROVED", "REJECTED"], APPROVED: ["SCHEDULED", "IMPLEMENTED"],
  REJECTED: ["DRAFT"], SCHEDULED: ["IMPLEMENTED", "FAILED"], IMPLEMENTED: ["CLOSED", "ROLLED_BACK"],
  FAILED: ["ROLLED_BACK", "SCHEDULED", "CLOSED"], ROLLED_BACK: ["CLOSED"], CLOSED: [],
};
const LABEL: Record<string, string> = {
  SUBMITTED: "ส่งเพื่ออนุมัติ / Submit", APPROVED: "อนุมัติ / Approve", REJECTED: "ปฏิเสธ / Reject",
  SCHEDULED: "จัดตารางเวลา / Schedule", IMPLEMENTED: "ดำเนินการแล้ว / Implemented", FAILED: "ล้มเหลว / Failed",
  ROLLED_BACK: "ย้อนกลับ / Roll back", CLOSED: "ปิด / Close", DRAFT: "แก้ไขใหม่ / Back to draft",
};
const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary" | "outline"> = {
  DRAFT: "outline", SUBMITTED: "warning", APPROVED: "success", REJECTED: "destructive",
  SCHEDULED: "warning", IMPLEMENTED: "success", FAILED: "destructive", ROLLED_BACK: "destructive", CLOSED: "secondary",
};
const fmt = (d: Date | null) => (d ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="border-b py-2 text-sm last:border-b-0"><p className="text-xs text-muted-foreground">{label}</p><div className="mt-0.5 whitespace-pre-wrap">{children}</div></div>;
}

export default async function ChangeDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("change:read")) notFound();

  const c = await prisma.changeRequest.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null } });
  if (!c) notFound();

  const canManage = user.permissions.has("change:manage");
  const canApprove = user.permissions.has("change:approve");
  const transitions = NEXT[c.status];

  return (
    <div>
      <PageHeader title={`${c.changeNumber} · ${c.title}`} description="รายละเอียดคำขอเปลี่ยนแปลง / Change request detail">
        <Button variant="outline" asChild><Link href="/changes"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm">รายละเอียด / Details <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge></CardTitle></CardHeader>
          <CardContent>
            <Field label="ความเสี่ยง / Risk">{c.risk}</Field>
            <Field label="ผลกระทบ / Impact">{c.impact ?? "-"}</Field>
            <Field label="รายละเอียด / Description">{c.description ?? "-"}</Field>
            <Field label="แผนทดสอบ / Test plan">{c.testPlan ?? "-"}</Field>
            <Field label="แผนย้อนกลับ / Rollback plan">{c.rollbackPlan ?? "-"}</Field>
            <Field label="กำหนดการ / Schedule">{fmt(c.scheduledStart)} → {fmt(c.scheduledEnd)}</Field>
            <Field label="อนุมัติเมื่อ / Approved">{c.approvedAt ? fmt(c.approvedAt) : "-"}</Field>
            {c.rejectReason && <Field label="เหตุผลปฏิเสธ / Reject reason">{c.rejectReason}</Field>}
            <Field label="ดำเนินการเมื่อ / Implemented">{c.implementedAt ? fmt(c.implementedAt) : "-"}</Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">การดำเนินการ / Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {transitions.length === 0 && <p className="text-sm text-muted-foreground">ไม่มีการดำเนินการเพิ่มเติม / No further actions (closed).</p>}
            {transitions.map((to) => {
              const needsApprove = to === "APPROVED" || to === "REJECTED";
              const allowed = needsApprove ? canApprove : canManage;
              if (!allowed) return null;
              const action = transitionChange.bind(null, c.id, to);
              const danger = to === "REJECTED" || to === "FAILED" || to === "ROLLED_BACK";
              return (
                <form key={to} action={action} className="space-y-1.5 rounded-md border p-2">
                  {to === "REJECTED" && <Input name="reason" placeholder="เหตุผล / Reason" className="h-8 text-xs" />}
                  <Button type="submit" variant={danger ? "destructive" : to === "APPROVED" ? "default" : "outline"} size="sm" className="w-full">{LABEL[to]}</Button>
                </form>
              );
            })}
            {transitions.some((to) => (to === "APPROVED" || to === "REJECTED")) && !canApprove && (
              <p className="text-xs text-amber-600">ต้องมีสิทธิ์ change:approve เพื่ออนุมัติ/ปฏิเสธ</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
