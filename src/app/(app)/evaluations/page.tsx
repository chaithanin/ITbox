import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { EVAL_TEMPLATES } from "@/lib/documents/evaluation-templates";

const STATUSES = ["DRAFT", "IN_REVIEW", "COMPLETED"] as const;
const TEMPLATES = ["IT_SUPPORT", "IT_ASSISTANT_MANAGER"] as const;

function gradeTone(grade: string | null): string {
  if (!grade) return "text-muted-foreground";
  if (grade.startsWith("Exceeds")) return "text-emerald-600 dark:text-emerald-400";
  if (grade.startsWith("Meets")) return "text-blue-600 dark:text-blue-400";
  if (grade.startsWith("Needs")) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export default async function EvaluationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("evaluation:read");
  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? (sp.status as (typeof STATUSES)[number]) : undefined;
  const template = TEMPLATES.includes(sp.template as (typeof TEMPLATES)[number]) ? (sp.template as (typeof TEMPLATES)[number]) : undefined;
  const { page, skip, take } = parsePage(sp.page);
  const canManage = user.permissions.has("evaluation:manage");

  const where: Prisma.EvaluationWhereInput = {
    organizationId: user.organizationId, deletedAt: null,
    ...(status ? { status } : {}),
    ...(template ? { template } : {}),
    ...(q ? { OR: [
      { employeeName: { contains: q, mode: "insensitive" } },
      { refNo: { contains: q, mode: "insensitive" } },
      { department: { contains: q, mode: "insensitive" } },
      { position: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };

  const [rows, total, byStatus] = await Promise.all([
    prisma.evaluation.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.evaluation.count({ where }),
    prisma.evaluation.groupBy({ by: ["status"], where: { organizationId: user.organizationId, deletedAt: null }, _count: true }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / take));
  const statusCount = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;

  return (
    <div>
      <PageHeader title="แบบประเมิน KPI 30/60/90 วัน / Probation KPI Assessment" description={`ทั้งหมด ${total} รายการ`}>
        {canManage && (
          <Button asChild><Link href="/evaluations/new"><Plus className="h-4 w-4" /> สร้างแบบประเมิน / New</Link></Button>
        )}
      </PageHeader>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {STATUSES.map((s) => (
          <Link key={s} href={`/evaluations?status=${s}`} className="rounded-full border px-2.5 py-1 hover:bg-muted">
            <StatusBadge status={s} /> <span className="ml-1 font-semibold tabular-nums">{statusCount(s)}</span>
          </Link>
        ))}
      </div>

      <SearchFilterBar
        action="/evaluations" q={sp.q} placeholder="ค้นหา ชื่อ / เลขที่ / แผนก / ตำแหน่ง..."
        filters={[
          { name: "template", value: sp.template, allLabel: "ทุกแบบฟอร์ม / All roles", options: TEMPLATES.map((tk) => ({ value: tk, label: EVAL_TEMPLATES[tk].role })) },
          { name: "status", value: sp.status, allLabel: "ทุกสถานะ / All", options: STATUSES.map((s) => ({ value: s, label: s })) },
        ]}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>เลขที่ / Ref</TableHead><TableHead>ผู้ถูกประเมิน / Employee</TableHead>
            <TableHead>ตำแหน่ง / Role</TableHead><TableHead>แบบฟอร์ม / Template</TableHead>
            <TableHead className="text-right">คะแนน / Score</TableHead><TableHead>เกรด / Grade</TableHead>
            <TableHead>วันที่ / Date</TableHead><TableHead>สถานะ</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground"><ClipboardCheck className="mx-auto mb-2 h-5 w-5" /> ยังไม่มีแบบประเมิน</TableCell></TableRow>}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.refNo ?? "—"}</TableCell>
                <TableCell>
                  <Link href={`/evaluations/${r.id}`} className="font-medium text-primary hover:underline">{r.employeeName || "—"}</Link>
                  {r.department && <span className="ml-1 text-xs text-muted-foreground">{r.department}</span>}
                </TableCell>
                <TableCell>{r.position ?? "—"}</TableCell>
                <TableCell className="text-xs">{EVAL_TEMPLATES[r.template]?.role ?? r.template}</TableCell>
                <TableCell className="text-right tabular-nums">{r.overallScore != null ? `${Math.round(r.overallScore)}` : "—"}</TableCell>
                <TableCell className={`text-xs font-medium ${gradeTone(r.grade)}`}>{r.grade ?? "—"}</TableCell>
                <TableCell className="text-xs">{formatDate(r.createdAt)}</TableCell>
                <TableCell><StatusBadge status={r.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Pagination page={page} pageCount={pageCount} basePath="/evaluations" searchParams={sp} />
    </div>
  );
}
