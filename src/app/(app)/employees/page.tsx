import Link from "next/link";
import { Plus, Upload, RefreshCcw } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { Prisma } from "@prisma/client";
import { JmlTabs } from "./jml-tabs";
import { syncEmployeeLinksAction } from "./actions";
import { OnboardingBoard } from "../onboarding/board";
import { OffboardingBoard } from "../offboarding/board";

const STATUS_OPTIONS = ["ACTIVE", "ON_LEAVE", "OFFBOARDING", "RESIGNED"] as const;

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("employee:read");
  const sp = await searchParams;
  const { page, skip, take } = parsePage(sp.page);

  // People / Joiner / Leaver tabs — Onboarding & Offboarding live here (one page).
  const show = { onboarding: user.permissions.has("onboarding:read"), offboarding: user.permissions.has("offboarding:read") };
  const tab = sp.tab === "onboarding" && show.onboarding ? "onboarding" : sp.tab === "offboarding" && show.offboarding ? "offboarding" : "employees";
  if (tab === "onboarding" || tab === "offboarding") {
    return (
      <div>
        <PageHeader title="พนักงาน / Employees" description="ข้อมูลพนักงาน การรับเข้า (Onboarding) และการพ้นสภาพ (Offboarding)" />
        <JmlTabs active={tab} show={show} />
        {tab === "onboarding" ? <OnboardingBoard /> : <OffboardingBoard />}
      </div>
    );
  }

  const q = sp.q?.trim() || undefined;
  const departmentId = sp.departmentId || undefined;
  const status = STATUS_OPTIONS.includes(sp.status as (typeof STATUS_OPTIONS)[number])
    ? (sp.status as (typeof STATUS_OPTIONS)[number])
    : undefined;

  const where: Prisma.EmployeeWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(departmentId ? { departmentId } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { employeeCode: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total, departments] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        department: { select: { name: true } },
        location: { select: { name: true } },
        _count: {
          select: { assetAssignments: { where: { status: "CHECKED_OUT" } } },
        },
      },
      orderBy: { employeeCode: "asc" },
      skip,
      take,
    }),
    prisma.employee.count({ where }),
    prisma.department.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader
        title="พนักงาน / Employees"
        description={`ทั้งหมด ${total} คน / ${total} employees`}
      >
        {user.permissions.has("employee:update") && (
          <form action={syncEmployeeLinksAction}>
            <Button type="submit" variant="outline" title="ซิงค์และจับคู่พนักงานกับบัญชีผู้ใช้ / Sync & match employees to user accounts">
              <RefreshCcw className="h-4 w-4" />
              ซิงค์ข้อมูล / Sync
            </Button>
          </form>
        )}
        {user.permissions.has("employee:create") && (
          <>
            <Button variant="outline" asChild>
              <Link href="/employees/import">
                <Upload className="h-4 w-4" />
                นำเข้า / Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/employees/new">
                <Plus className="h-4 w-4" />
                เพิ่มพนักงาน / New
              </Link>
            </Button>
          </>
        )}
      </PageHeader>

      {sp.synced && (
        <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          ซิงค์สำเร็จ / Sync complete — จับคู่ใหม่ {sp.linked ?? 0} · ไม่พบบัญชี {sp.unmatched ?? 0} · มีบัญชีอยู่แล้ว {sp.already ?? 0}
        </div>
      )}

      <JmlTabs active="employees" show={show} />

      <SearchFilterBar
        action="/employees"
        q={sp.q}
        placeholder="ค้นหา ชื่อ / รหัส / อีเมล..."
        filters={[
          {
            name: "departmentId",
            value: sp.departmentId,
            allLabel: "ทุกแผนก / All departments",
            options: departments.map((d) => ({ value: d.id, label: d.name })),
          },
          {
            name: "status",
            value: sp.status,
            allLabel: "ทุกสถานะ / All statuses",
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s.replaceAll("_", " ") })),
          },
        ]}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>รหัส / Code</TableHead>
            <TableHead>ชื่อ-นามสกุล / Name</TableHead>
            <TableHead>ตำแหน่ง / Position</TableHead>
            <TableHead>แผนก / Department</TableHead>
            <TableHead>สถานที่ / Location</TableHead>
            <TableHead>สถานะ / Status</TableHead>
            <TableHead className="text-right">ทรัพย์สินที่ถือ / Assets held</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                ไม่พบข้อมูล / No employees found
              </TableCell>
            </TableRow>
          )}
          {rows.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="font-mono text-xs">{e.employeeCode}</TableCell>
              <TableCell>
                <Link href={`/employees/${e.id}`} className="font-medium text-primary hover:underline">
                  {e.firstName} {e.lastName}
                </Link>
              </TableCell>
              <TableCell>{e.position ?? "-"}</TableCell>
              <TableCell>{e.department?.name ?? "-"}</TableCell>
              <TableCell>{e.location?.name ?? "-"}</TableCell>
              <TableCell>
                <StatusBadge status={e.status} />
              </TableCell>
              <TableCell className="text-right">{e._count.assetAssignments}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination page={page} pageCount={pageCount} basePath="/employees" searchParams={sp} />
    </div>
  );
}
