import Link from "next/link";
import { Bug, Plus } from "lucide-react";
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
import { createProblem } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary" | "outline"> = {
  OPEN: "destructive", INVESTIGATING: "warning", KNOWN_ERROR: "warning", RESOLVED: "success", CLOSED: "secondary",
};

export default async function ProblemsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("problem:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const canManage = user.permissions.has("problem:manage");
  const orgId = user.organizationId;

  const problems = await prisma.problem.findMany({
    where: { organizationId: orgId, deletedAt: null },
    include: { _count: { select: { cases: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return (
    <div>
      <PageHeader title="การจัดการปัญหา / Problem Management" description="รวมเหตุการณ์ที่เกิดซ้ำ → หาสาเหตุราก (RCA) → Known Error → แก้ถาวร" />

      {canManage && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4 text-primary" /> เปิดปัญหาใหม่ / New problem</CardTitle></CardHeader>
          <CardContent>
            <form action={createProblem} className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2"><Label htmlFor="title">หัวข้อ / Title *</Label><Input id="title" name="title" required minLength={3} maxLength={300} className="mt-1" /></div>
              <div><Label htmlFor="priority">ความสำคัญ / Priority *</Label><Select id="priority" name="priority" required defaultValue="P3" className="mt-1">{["P1", "P2", "P3", "P4"].map((p) => <option key={p} value={p}>{p}</option>)}</Select></div>
              <div className="flex items-end"><Button type="submit" className="w-full"><Plus className="h-4 w-4" /> เปิด</Button></div>
              <div className="sm:col-span-4"><Label htmlFor="description">รายละเอียด / Description</Label><Textarea id="description" name="description" rows={2} className="mt-1" /></div>
            </form>
          </CardContent>
        </Card>
      )}

      <Table>
        <TableHeader><TableRow>
          <TableHead>เลขที่ / No.</TableHead><TableHead>หัวข้อ</TableHead><TableHead>Priority</TableHead><TableHead>Incidents</TableHead><TableHead>Known Error</TableHead><TableHead>สถานะ</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {problems.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ยังไม่มีปัญหา / No problems</TableCell></TableRow>}
          {problems.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-xs"><Link href={`/problems/${p.id}`} className="text-primary hover:underline">{p.problemNumber}</Link></TableCell>
              <TableCell className="font-medium"><span className="flex items-center gap-2"><Bug className="h-3.5 w-3.5 text-muted-foreground" />{p.title}</span></TableCell>
              <TableCell><Badge variant={p.priority === "P1" ? "destructive" : p.priority === "P2" ? "warning" : "secondary"}>{p.priority}</Badge></TableCell>
              <TableCell className="tabular-nums">{p._count.cases}</TableCell>
              <TableCell>{p.knownError ? <Badge variant="warning">Known Error</Badge> : "-"}</TableCell>
              <TableCell><Badge variant={STATUS_VARIANT[p.status]}>{p.status.replace("_", " ")}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
