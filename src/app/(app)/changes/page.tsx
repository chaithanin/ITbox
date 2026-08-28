import Link from "next/link";
import { GitPullRequest, Plus, CalendarClock } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { createChange } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "destructive" | "warning" | "secondary" | "outline"> = {
  DRAFT: "outline", SUBMITTED: "warning", APPROVED: "success", REJECTED: "destructive",
  SCHEDULED: "warning", IMPLEMENTED: "success", FAILED: "destructive", ROLLED_BACK: "destructive", CLOSED: "secondary",
};
const RISK_VARIANT: Record<string, "success" | "warning" | "destructive"> = { LOW: "success", MEDIUM: "warning", HIGH: "destructive" };
const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-");

export default async function ChangesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("change:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const canManage = user.permissions.has("change:manage");
  const orgId = user.organizationId;

  const [changes, upcoming] = await Promise.all([
    prisma.changeRequest.findMany({ where: { organizationId: orgId, deletedAt: null }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.changeRequest.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { in: ["APPROVED", "SCHEDULED"] }, scheduledStart: { gte: new Date() } },
      orderBy: { scheduledStart: "asc" }, take: 5,
    }),
  ]);

  return (
    <div>
      <PageHeader title="การจัดการการเปลี่ยนแปลง / Change Management" description="RFC · ประเมินความเสี่ยง · อนุมัติ · ตารางเวลา · rollback plan" />

      {upcoming.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><CalendarClock className="h-4 w-4 text-sky-600" /> Change Calendar — กำหนดการที่จะถึง</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {upcoming.map((c) => (
              <Link key={c.id} href={`/changes/${c.id}`} className="flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted/50">
                <Badge variant={RISK_VARIANT[c.risk]}>{c.risk}</Badge>
                <span className="flex-1 truncate font-medium">{c.changeNumber} · {c.title}</span>
                <span className="text-xs text-muted-foreground">{fmt(c.scheduledStart)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {canManage && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4 text-primary" /> สร้างคำขอเปลี่ยนแปลง / New change request</CardTitle></CardHeader>
          <CardContent>
            <form action={createChange} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label htmlFor="title">หัวข้อ / Title *</Label><Input id="title" name="title" required minLength={3} maxLength={300} className="mt-1" /></div>
              <div><Label htmlFor="risk">ความเสี่ยง / Risk *</Label><Select id="risk" name="risk" required defaultValue="LOW" className="mt-1">{["LOW", "MEDIUM", "HIGH"].map((r) => <option key={r} value={r}>{r}</option>)}</Select></div>
              <div><Label htmlFor="impact">ผลกระทบ / Impact</Label><Input id="impact" name="impact" className="mt-1" /></div>
              <div className="sm:col-span-2"><Label htmlFor="description">รายละเอียด / Description</Label><Textarea id="description" name="description" rows={2} className="mt-1" /></div>
              <div><Label htmlFor="scheduledStart">เริ่ม / Scheduled start</Label><Input id="scheduledStart" name="scheduledStart" type="datetime-local" className="mt-1" /></div>
              <div><Label htmlFor="scheduledEnd">สิ้นสุด / Scheduled end</Label><Input id="scheduledEnd" name="scheduledEnd" type="datetime-local" className="mt-1" /></div>
              <div className="sm:col-span-2"><Label htmlFor="testPlan">แผนทดสอบ / Test plan</Label><Textarea id="testPlan" name="testPlan" rows={2} className="mt-1" /></div>
              <div className="sm:col-span-2"><Label htmlFor="rollbackPlan">แผนย้อนกลับ / Rollback plan</Label><Textarea id="rollbackPlan" name="rollbackPlan" rows={2} className="mt-1" /></div>
              <div className="flex items-end sm:col-span-2"><Button type="submit"><Plus className="h-4 w-4" /> สร้าง (Draft)</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader><TableRow>
          <TableHead>เลขที่ / No.</TableHead><TableHead>หัวข้อ</TableHead><TableHead>Risk</TableHead><TableHead>สถานะ</TableHead><TableHead>กำหนดการ</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {changes.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">ยังไม่มีคำขอเปลี่ยนแปลง / No change requests</TableCell></TableRow>}
          {changes.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-mono text-xs"><Link href={`/changes/${c.id}`} className="text-primary hover:underline">{c.changeNumber}</Link></TableCell>
              <TableCell className="font-medium"><span className="flex items-center gap-2"><GitPullRequest className="h-3.5 w-3.5 text-muted-foreground" />{c.title}</span></TableCell>
              <TableCell><Badge variant={RISK_VARIANT[c.risk]}>{c.risk}</Badge></TableCell>
              <TableCell><Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge></TableCell>
              <TableCell className="text-xs text-muted-foreground">{fmt(c.scheduledStart)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
