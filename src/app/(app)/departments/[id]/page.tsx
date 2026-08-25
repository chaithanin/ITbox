import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Merge } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { mergeDepartment } from "../actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

export default async function DepartmentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("department:read");
  const { id } = await params;
  const sp = await searchParams;
  const mergeMsg = sp.ok === "merged" ? { text: "รวมแผนกเรียบร้อยแล้ว / Departments merged", error: false }
    : sp.error === "same" ? { text: "เลือกแผนกปลายทางที่ต่างจากแผนกนี้ / Pick a different target", error: true }
    : sp.error === "notfound" ? { text: "ไม่พบแผนก / Department not found", error: true }
    : null;

  const department = await prisma.department.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!department) notFound();

  const [employees, assets, assetCount, vaultItemCount, otherDepts] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId: user.organizationId, departmentId: id, deletedAt: null },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        position: true,
        status: true,
        startDate: true,
      },
      orderBy: { employeeCode: "asc" },
    }),
    prisma.asset.findMany({
      where: { organizationId: user.organizationId, departmentId: id, deletedAt: null },
      select: { id: true, assetTag: true, name: true, status: true },
      orderBy: { assetTag: "asc" },
      take: 20,
    }),
    prisma.asset.count({
      where: { organizationId: user.organizationId, departmentId: id, deletedAt: null },
    }),
    prisma.vaultItem.count({
      where: { organizationId: user.organizationId, departmentId: id, deletedAt: null },
    }),
    prisma.department.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, id: { not: id } },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${department.code} — ${department.name}`}
        description={[department.division, department.costCenter].filter(Boolean).join(" · ") || undefined}
      >
        {user.permissions.has("department:manage") && (
          <Button variant="outline" asChild>
            <Link href={`/departments/${department.id}/edit`}>
              <Pencil className="h-4 w-4" />
              แก้ไข / Edit
            </Link>
          </Button>
        )}
      </PageHeader>

      {mergeMsg && (
        <p className={`rounded-md px-3 py-2 text-sm ${mergeMsg.error ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
          {mergeMsg.text}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="พนักงาน / Employees" value={employees.length} />
        <StatCard
          label="ทรัพย์สิน / Assets"
          value={assetCount}
          href={`/assets?departmentId=${department.id}`}
        />
        <StatCard
          label="รายการ Vault / Vault items"
          value={vaultItemCount}
          sub="เฉพาะข้อมูลเมตา / Metadata only"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>พนักงาน / Employees ({employees.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {employees.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีพนักงาน / No employees</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รหัส / Code</TableHead>
                  <TableHead>ชื่อ-นามสกุล / Name</TableHead>
                  <TableHead>ตำแหน่ง / Position</TableHead>
                  <TableHead>เริ่มงาน / Start</TableHead>
                  <TableHead>สถานะ / Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.employeeCode}</TableCell>
                    <TableCell>
                      <Link href={`/employees/${e.id}`} className="text-primary hover:underline">
                        {e.firstName} {e.lastName}
                      </Link>
                    </TableCell>
                    <TableCell>{e.position ?? "-"}</TableCell>
                    <TableCell>{formatDate(e.startDate)}</TableCell>
                    <TableCell>
                      <StatusBadge status={e.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ทรัพย์สิน / Assets ({assetCount})</CardTitle>
          {assetCount > 20 && (
            <CardDescription>
              แสดง 20 รายการแรก / Showing first 20 —{" "}
              <Link href={`/assets?departmentId=${department.id}`} className="text-primary hover:underline">
                ดูทั้งหมด / View all
              </Link>
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีทรัพย์สิน / No assets</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>ชื่อ / Name</TableHead>
                  <TableHead>สถานะ / Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.assetTag}</TableCell>
                    <TableCell>
                      <Link href={`/assets/${a.id}`} className="text-primary hover:underline">
                        {a.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={a.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {user.permissions.has("department:manage") && otherDepts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">รวมแผนกซ้ำ / Merge duplicate department</CardTitle>
            <CardDescription>
              ย้ายพนักงาน ทรัพย์สิน และข้อมูลอื่นๆ ทั้งหมดของ “{department.code} — {department.name}” ไปยังแผนกปลายทาง
              แล้วปิดแผนกนี้ (ใช้รวมแผนกที่ซ้ำกัน เช่น IT กับ Information Technology) /
              Move everything to the target and retire this one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={mergeDepartment} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="sourceId" value={department.id} />
              <div className="min-w-[240px] flex-1">
                <label htmlFor="targetId" className="text-sm font-medium">รวมไปยัง / Merge into *</label>
                <Select id="targetId" name="targetId" required defaultValue="" className="mt-1">
                  <option value="" disabled>— เลือกแผนกปลายทาง / Select target —</option>
                  {otherDepts.map((d) => (
                    <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                  ))}
                </Select>
              </div>
              <ConfirmButton
                variant="destructive"
                confirmText={`ยืนยันรวมแผนก “${department.name}” ไปยังแผนกที่เลือก? ข้อมูลทั้งหมดจะถูกย้ายและแผนกนี้จะถูกปิด / Merge and retire this department?`}
              >
                <Merge className="h-4 w-4" /> รวมแผนก / Merge
              </ConfirmButton>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
