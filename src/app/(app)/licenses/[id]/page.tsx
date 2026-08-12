import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, UserPlus } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ConfirmButton } from "@/components/confirm-button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney, daysUntil } from "@/lib/utils";
import { assignLicense, revokeLicenseAssignment, deleteLicense } from "../actions";

export default async function LicenseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("license:read")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const license = await prisma.license.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      vendor: { select: { id: true, name: true } },
      assignments: {
        include: {
          employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        },
        orderBy: { assignedAt: "desc" },
      },
    },
  });
  if (!license) notFound();

  const activeAssignments = license.assignments.filter((a) => !a.revokedAt);
  const seatsAvailable = license.totalSeats - activeAssignments.length;
  const canManage = user.permissions.has("license:manage");
  const days = daysUntil(license.expiresAt);

  const employees = canManage
    ? await prisma.employee.findMany({
        where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
        select: { id: true, firstName: true, lastName: true, employeeCode: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      })
    : [];

  const info: { label: string; value: React.ReactNode }[] = [
    { label: "ผู้จำหน่าย / Vendor", value: license.vendor?.name ?? "-" },
    { label: "ประเภท / Type", value: license.licenseType ?? "-" },
    {
      label: "ที่นั่ง / Seats",
      value: `${activeAssignments.length} / ${license.totalSeats}`,
    },
    { label: "วันที่ซื้อ / Purchase date", value: formatDate(license.purchaseDate) },
    { label: "วันที่เริ่มใช้ / Start date", value: formatDate(license.startDate) },
    {
      label: "วันหมดอายุ / Expires",
      value: (
        <span className="flex items-center gap-2">
          {formatDate(license.expiresAt)}
          {days !== null && days < 0 && <Badge variant="destructive">หมดอายุ / Expired</Badge>}
          {days !== null && days >= 0 && days < 30 && (
            <Badge variant="warning">{days} วัน / days</Badge>
          )}
        </span>
      ),
    },
    { label: "ราคา / Cost", value: formatMoney(license.cost) },
    { label: "ค่าต่ออายุ / Renewal cost", value: formatMoney(license.renewalCost) },
    {
      label: "ต่ออายุอัตโนมัติ / Auto-renewal",
      value: license.autoRenewal ? (
        <Badge variant="success">เปิด / On</Badge>
      ) : (
        <Badge variant="outline">ปิด / Off</Badge>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={license.softwareName} description="รายละเอียดลิขสิทธิ์ / License detail">
        {canManage && (
          <>
            <Button variant="outline" asChild>
              <Link href={`/licenses/${license.id}/edit`}>
                <Pencil className="h-4 w-4" /> แก้ไข / Edit
              </Link>
            </Button>
            <form action={deleteLicense.bind(null, license.id)}>
              <ConfirmButton
                variant="destructive"
                confirmText="ลบลิขสิทธิ์นี้? / Delete this license?"
              >
                ลบ / Delete
              </ConfirmButton>
            </form>
          </>
        )}
      </PageHeader>

      {sp.error === "full" && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          ที่นั่งเต็มแล้ว ไม่สามารถมอบหมายเพิ่มได้ / All seats are in use — cannot assign more.
        </div>
      )}
      {sp.error === "employee" && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          ไม่พบพนักงานที่เลือก / Selected employee not found or not active.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>ข้อมูลลิขสิทธิ์ / License info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {info.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="text-right font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
            {license.notes && (
              <div className="mt-4 border-t pt-3 text-sm">
                <p className="mb-1 text-muted-foreground">หมายเหตุ / Notes</p>
                <p className="whitespace-pre-wrap">{license.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>
                  มอบหมายที่นั่ง / Assign seat{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    (ว่าง {seatsAvailable} / available)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  action={assignLicense.bind(null, license.id)}
                  className="flex flex-wrap items-end gap-2"
                >
                  <div className="min-w-[220px] flex-1">
                    <Label htmlFor="employeeId">พนักงาน / Employee</Label>
                    <Select id="employeeId" name="employeeId" required className="mt-1" defaultValue="">
                      <option value="" disabled>
                        — เลือกพนักงาน / Select employee —
                      </option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.firstName} {e.lastName} ({e.employeeCode})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button type="submit" disabled={seatsAvailable <= 0}>
                    <UserPlus className="h-4 w-4" /> มอบหมาย / Assign
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>การมอบหมาย / Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>พนักงาน / Employee</TableHead>
                    <TableHead>มอบหมายเมื่อ / Assigned</TableHead>
                    <TableHead>เพิกถอนเมื่อ / Revoked</TableHead>
                    {canManage && <TableHead className="text-right">จัดการ / Action</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {license.assignments.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={canManage ? 4 : 3}
                        className="py-8 text-center text-muted-foreground"
                      >
                        ยังไม่มีการมอบหมาย / No assignments yet
                      </TableCell>
                    </TableRow>
                  )}
                  {license.assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">
                        {a.employee.firstName} {a.employee.lastName}{" "}
                        <span className="text-muted-foreground">({a.employee.employeeCode})</span>
                      </TableCell>
                      <TableCell>{formatDateTime(a.assignedAt)}</TableCell>
                      <TableCell>
                        {a.revokedAt ? (
                          formatDateTime(a.revokedAt)
                        ) : (
                          <Badge variant="success">ใช้งาน / Active</Badge>
                        )}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          {!a.revokedAt && (
                            <form action={revokeLicenseAssignment.bind(null, a.id)}>
                              <ConfirmButton
                                variant="outline"
                                size="sm"
                                confirmText="เพิกถอนที่นั่งนี้? / Revoke this seat?"
                              >
                                เพิกถอน / Revoke
                              </ConfirmButton>
                            </form>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
