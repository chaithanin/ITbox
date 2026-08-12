import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ShieldAlert, UserX } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { formatDate, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { softDeleteEmployee, startOffboarding } from "../actions";

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("employee:read");
  const { id } = await params;

  const employee = await prisma.employee.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      manager: { select: { id: true, firstName: true, lastName: true } },
      user: { select: { id: true, email: true, status: true } },
    },
  });
  if (!employee) notFound();

  // PDPA: personal data access is role-restricted and audited.
  await auditLog(user, {
    action: "VIEW",
    entityType: "EMPLOYEE",
    entityId: employee.id,
    detail: { employeeCode: employee.employeeCode },
  });

  const now = new Date();
  const [openAssignments, historyAssignments, licenseAssignments, vaultShares, offboardings] =
    await Promise.all([
      prisma.assetAssignment.findMany({
        where: {
          organizationId: user.organizationId,
          employeeId: employee.id,
          status: "CHECKED_OUT",
        },
        include: { asset: { select: { id: true, assetTag: true, name: true, status: true } } },
        orderBy: { assignedAt: "desc" },
      }),
      prisma.assetAssignment.findMany({
        where: {
          organizationId: user.organizationId,
          employeeId: employee.id,
          status: "RETURNED",
        },
        include: { asset: { select: { id: true, assetTag: true, name: true } } },
        orderBy: { assignedAt: "desc" },
        take: 20,
      }),
      prisma.licenseAssignment.findMany({
        where: {
          employeeId: employee.id,
          revokedAt: null,
          license: { organizationId: user.organizationId, deletedAt: null },
        },
        include: { license: { select: { id: true, softwareName: true, expiresAt: true } } },
        orderBy: { assignedAt: "desc" },
      }),
      employee.userId
        ? prisma.vaultShare.findMany({
            where: {
              userId: employee.userId,
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
              vaultItem: { organizationId: user.organizationId, deletedAt: null },
            },
            // Metadata only — NEVER secret values.
            select: {
              id: true,
              permission: true,
              expiresAt: true,
              vaultItem: { select: { name: true } },
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      prisma.offboarding.findMany({
        where: { organizationId: user.organizationId, employeeId: employee.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const fullName = `${employee.firstName} ${employee.lastName}`;

  return (
    <div className="space-y-5">
      <PageHeader title={fullName} description={`${employee.employeeCode} · ${employee.position ?? "-"}`}>
        {user.permissions.has("employee:update") && (
          <Button variant="outline" asChild>
            <Link href={`/employees/${employee.id}/edit`}>
              <Pencil className="h-4 w-4" />
              แก้ไข / Edit
            </Link>
          </Button>
        )}
        {employee.status === "ACTIVE" && user.permissions.has("offboarding:manage") && (
          <form action={startOffboarding}>
            <input type="hidden" name="employeeId" value={employee.id} />
            <ConfirmButton
              variant="destructive"
              confirmText="เริ่มกระบวนการ Offboarding สำหรับพนักงานคนนี้? / Start offboarding for this employee?"
            >
              <UserX className="h-4 w-4" />
              เริ่ม Offboarding / Start Offboarding
            </ConfirmButton>
          </form>
        )}
        {user.permissions.has("employee:delete") && (
          <form action={softDeleteEmployee}>
            <input type="hidden" name="id" value={employee.id} />
            <ConfirmButton
              variant="outline"
              confirmText="ลบข้อมูลพนักงานคนนี้? / Delete this employee?"
            >
              ลบ / Delete
            </ConfirmButton>
          </form>
        )}
      </PageHeader>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>ข้อมูลส่วนตัว / Profile</CardTitle>
            <StatusBadge status={employee.status} />
          </div>
          <CardDescription className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" />
            PDPA: การเข้าถึงข้อมูลส่วนบุคคลถูกจำกัดตามสิทธิ์และมีการบันทึกการเข้าถึงทุกครั้ง /
            Personal data access is role-restricted and audited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">อีเมล / Email</dt>
              <dd>{employee.email ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">โทรศัพท์ / Phone</dt>
              <dd>{employee.phone ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">แผนก / Department</dt>
              <dd>
                {employee.department ? (
                  <Link href={`/departments/${employee.department.id}`} className="text-primary hover:underline">
                    {employee.department.name}
                  </Link>
                ) : (
                  "-"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">สถานที่ / Location</dt>
              <dd>{employee.location?.name ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">หัวหน้า / Manager</dt>
              <dd>
                {employee.manager ? (
                  <Link href={`/employees/${employee.manager.id}`} className="text-primary hover:underline">
                    {employee.manager.firstName} {employee.manager.lastName}
                  </Link>
                ) : (
                  "-"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">บัญชีผู้ใช้ / User account</dt>
              <dd>
                {employee.user ? (
                  <span className="inline-flex items-center gap-2">
                    {employee.user.email} <StatusBadge status={employee.user.status} />
                  </span>
                ) : (
                  "-"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">วันเริ่มงาน / Start date</dt>
              <dd>{formatDate(employee.startDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">วันสิ้นสุด / End date</dt>
              <dd>{formatDate(employee.endDate)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            ทรัพย์สินที่ถือครอง / Current Assets ({openAssignments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {openAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีทรัพย์สินที่ถือครอง / No assets held</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>ทรัพย์สิน / Asset</TableHead>
                  <TableHead>วันที่เบิก / Assigned</TableHead>
                  <TableHead>กำหนดคืน / Expected return</TableHead>
                  <TableHead>สถานะ / Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openAssignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.asset.assetTag}</TableCell>
                    <TableCell>
                      <Link href={`/assets/${a.asset.id}`} className="text-primary hover:underline">
                        {a.asset.name}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(a.assignedAt)}</TableCell>
                    <TableCell>{formatDate(a.expectedReturnDate)}</TableCell>
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

      <Card>
        <CardHeader>
          <CardTitle>ประวัติการเบิก-คืน / Assignment History</CardTitle>
        </CardHeader>
        <CardContent>
          {historyAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีประวัติ / No history</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>ทรัพย์สิน / Asset</TableHead>
                  <TableHead>วันที่เบิก / Assigned</TableHead>
                  <TableHead>วันที่คืน / Returned</TableHead>
                  <TableHead>สถานะ / Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyAssignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs">{a.asset.assetTag}</TableCell>
                    <TableCell>
                      <Link href={`/assets/${a.asset.id}`} className="text-primary hover:underline">
                        {a.asset.name}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(a.assignedAt)}</TableCell>
                    <TableCell>{formatDate(a.returnedAt)}</TableCell>
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

      <Card>
        <CardHeader>
          <CardTitle>ซอฟต์แวร์ไลเซนส์ / Software Licenses ({licenseAssignments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {licenseAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีไลเซนส์ / No active licenses</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ซอฟต์แวร์ / Software</TableHead>
                  <TableHead>วันที่มอบ / Assigned</TableHead>
                  <TableHead>หมดอายุ / Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {licenseAssignments.map((la) => (
                  <TableRow key={la.id}>
                    <TableCell>
                      <Link href={`/licenses/${la.license.id}`} className="text-primary hover:underline">
                        {la.license.softwareName}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(la.assignedAt)}</TableCell>
                    <TableCell>{formatDate(la.license.expiresAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>สิทธิ์เข้าถึง Vault / Vault Shares ({vaultShares.length})</CardTitle>
          <CardDescription>
            แสดงเฉพาะข้อมูลเมตา ไม่แสดงค่าความลับ / Metadata only — secret values are never shown here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {vaultShares.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              ไม่มีสิทธิ์เข้าถึง Vault / No active vault shares
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>รายการ / Vault item</TableHead>
                  <TableHead>สิทธิ์ / Permission</TableHead>
                  <TableHead>หมดอายุ / Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vaultShares.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.vaultItem.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={s.permission} label={s.permission} />
                    </TableCell>
                    <TableCell>{s.expiresAt ? formatDateTime(s.expiresAt) : "ไม่หมดอายุ / Never"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ประวัติ Offboarding / Offboarding Records</CardTitle>
        </CardHeader>
        <CardContent>
          {offboardings.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีข้อมูล / No offboarding records</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>วันที่เริ่ม / Started</TableHead>
                  <TableHead>สถานะ / Status</TableHead>
                  <TableHead>เสร็จสิ้น / Completed</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {offboardings.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>{formatDate(o.createdAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                    </TableCell>
                    <TableCell>{formatDate(o.completedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/offboarding/${o.id}`}>ดู / View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
