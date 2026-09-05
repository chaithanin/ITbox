import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

const STATUSES = ["ACTIVE", "UNUSED", "SUSPENDED", "TERMINATED"] as const;

export default async function SimPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("sim:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const q = sp.q?.trim() || undefined;
  const carrier = sp.carrier || undefined;
  const status = STATUSES.includes(sp.status as (typeof STATUSES)[number]) ? (sp.status as (typeof STATUSES)[number]) : undefined;
  const { page, skip, take } = parsePage(sp.page);

  const where: Prisma.SimCardWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(carrier ? { carrier } : {}),
    ...(status ? { status } : {}),
    ...(q ? { OR: [
      { phoneNumber: { contains: q, mode: "insensitive" } },
      { holder: { contains: q, mode: "insensitive" } },
      { accountName: { contains: q, mode: "insensitive" } },
      { simSerial: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };

  const [rows, total, carriers] = await Promise.all([
    prisma.simCard.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true } }, department: { select: { name: true } } },
      orderBy: [{ carrier: "asc" }, { phoneNumber: "asc" }],
      skip, take,
    }),
    prisma.simCard.count({ where }),
    prisma.simCard.findMany({ where: { organizationId: user.organizationId, deletedAt: null }, select: { carrier: true }, distinct: ["carrier"], orderBy: { carrier: "asc" } }),
  ]);
  const canManage = user.permissions.has("sim:manage");
  const pageCount = Math.max(1, Math.ceil(total / take));

  // Dashboard stats (org-wide, ignore filters)
  const orgWhere = { organizationId: user.organizationId, deletedAt: null };
  const [usedCount, freeCount, accountRows] = await Promise.all([
    prisma.simCard.count({ where: { ...orgWhere, status: "ACTIVE" } }),
    prisma.simCard.count({ where: { ...orgWhere, status: "UNUSED" } }),
    prisma.simCard.findMany({ where: { ...orgWhere, accountName: { not: null } }, select: { accountName: true }, distinct: ["accountName"] }),
  ]);
  const accountCount = accountRows.filter((a) => (a.accountName ?? "").trim() !== "").length;

  return (
    <div>
      <PageHeader title="เบอร์/ซิม / SIM & Phone Lines" description={`ทั้งหมด ${total} เบอร์ / ${total} lines`}>
        {canManage && (
          <>
            <Button variant="outline" asChild><Link href="/sim/import"><Upload className="h-4 w-4" /> นำเข้า / Import</Link></Button>
            <Button asChild><Link href="/sim/new"><Plus className="h-4 w-4" /> เพิ่มเบอร์ / New</Link></Button>
          </>
        )}
      </PageHeader>

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard label="ใช้แล้ว / In use (ACTIVE)" value={usedCount} tone="default" />
        <StatCard label="ว่าง / Available (UNUSED)" value={freeCount} tone={freeCount > 0 ? "success" : "default"} />
        <StatCard label="บัญชีที่ใช้งาน / Active accounts" value={accountCount} tone="default" />
      </div>

      <SearchFilterBar
        action="/sim"
        q={sp.q}
        placeholder="ค้นหา เบอร์ / ผู้ถือ / บัญชี / SIM..."
        filters={[
          { name: "carrier", value: sp.carrier, allLabel: "ทุกค่าย / All carriers", options: carriers.map((c) => ({ value: c.carrier, label: c.carrier })) },
          { name: "status", value: sp.status, allLabel: "ทุกสถานะ / All statuses", options: STATUSES.map((s) => ({ value: s, label: s })) },
        ]}
      />

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>เบอร์ / Number</TableHead>
              <TableHead>ค่าย / Carrier</TableHead>
              <TableHead>บัญชี / Account</TableHead>
              <TableHead>ผู้ถือครอง / Holder</TableHead>
              <TableHead>แผนก / Dept</TableHead>
              <TableHead>สถานะ / Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">ไม่พบข้อมูล / No SIM lines</TableCell></TableRow>
            )}
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-mono text-sm">
                  <Link href={`/sim/${s.id}`} className="font-medium text-primary hover:underline">{s.phoneNumber}</Link>
                </TableCell>
                <TableCell>{s.carrier}</TableCell>
                <TableCell>{s.accountName ?? "-"}</TableCell>
                <TableCell>{s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : (s.holder ?? "-")}</TableCell>
                <TableCell>{s.department?.name ?? "-"}</TableCell>
                <TableCell><StatusBadge status={s.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Pagination page={page} pageCount={pageCount} basePath="/sim" searchParams={sp} />
    </div>
  );
}
