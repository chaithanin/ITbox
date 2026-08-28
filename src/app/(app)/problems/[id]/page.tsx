import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Link2 } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateProblem, linkCase } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProblemDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("problem:read")) notFound();

  const p = await prisma.problem.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: { cases: { select: { id: true, caseNumber: true, subject: true, status: true }, orderBy: { createdAt: "desc" } } },
  });
  if (!p) notFound();
  const canManage = user.permissions.has("problem:manage");
  const update = updateProblem.bind(null, p.id);
  const link = linkCase.bind(null, p.id);

  return (
    <div>
      <PageHeader title={`${p.problemNumber} · ${p.title}`} description="รายละเอียดปัญหา / Problem detail">
        <Button variant="outline" asChild><Link href="/problems"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm">สาเหตุราก & แนวทาง / RCA <Badge variant={p.knownError ? "warning" : "secondary"}>{p.knownError ? "Known Error" : p.status}</Badge></CardTitle></CardHeader>
          <CardContent>
            {p.description && <p className="mb-3 whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</p>}
            {canManage ? (
              <form action={update} className="grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor="status">สถานะ / Status</Label><Select id="status" name="status" defaultValue={p.status} className="mt-1">{["OPEN", "INVESTIGATING", "KNOWN_ERROR", "RESOLVED", "CLOSED"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select></div>
                <div><Label htmlFor="priority">Priority</Label><Select id="priority" name="priority" defaultValue={p.priority} className="mt-1">{["P1", "P2", "P3", "P4"].map((x) => <option key={x} value={x}>{x}</option>)}</Select></div>
                <div className="sm:col-span-2"><Label htmlFor="rootCause">สาเหตุราก / Root cause</Label><Textarea id="rootCause" name="rootCause" rows={3} defaultValue={p.rootCause ?? ""} className="mt-1" /></div>
                <div className="sm:col-span-2"><Label htmlFor="workaround">แนวทางชั่วคราว / Workaround</Label><Textarea id="workaround" name="workaround" rows={2} defaultValue={p.workaround ?? ""} className="mt-1" /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="knownError" value="on" defaultChecked={p.knownError} className="h-3.5 w-3.5" /> ทำเครื่องหมายเป็น Known Error</label>
                <div className="flex items-end justify-end sm:col-span-2"><Button type="submit">บันทึก / Save</Button></div>
              </form>
            ) : (
              <div className="space-y-2 text-sm">
                <p><span className="text-muted-foreground">Root cause:</span> {p.rootCause ?? "-"}</p>
                <p><span className="text-muted-foreground">Workaround:</span> {p.workaround ?? "-"}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Link2 className="h-4 w-4 text-sky-600" /> เหตุการณ์ที่เกี่ยวข้อง / Incidents ({p.cases.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {p.cases.length === 0 && <p className="text-sm text-muted-foreground">ยังไม่มีเคสที่ผูกไว้</p>}
            {p.cases.map((c) => (
              <Link key={c.id} href={`/support/${c.id}`} className="block rounded-md border p-2 text-sm hover:bg-muted/50">
                <span className="font-mono text-xs text-primary">{c.caseNumber}</span> · {c.subject}
                <span className="block text-xs text-muted-foreground">{c.status}</span>
              </Link>
            ))}
            {canManage && (
              <form action={link} className="flex gap-2 pt-1">
                <Input name="caseNumber" placeholder="เลขเคส เช่น IT-INC-2026-000001" className="h-8 text-xs" />
                <Button type="submit" size="sm" variant="outline" className="h-8">ผูก / Link</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
