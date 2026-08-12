import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  returnAllAssets,
  revokeAllLicenses,
  revokeVaultAccess,
  disableAccount,
  completeOffboarding,
  cancelOffboarding,
} from "../actions";

function SectionStatus({ done }: { done: boolean }) {
  return done ? (
    <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-4 w-4" />
      เรียบร้อย / Done
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400">
      <CircleAlert className="h-4 w-4" />
      ค้างดำเนินการ / Outstanding
    </span>
  );
}

export default async function OffboardingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("offboarding:read");
  const { id } = await params;

  const offboarding = await prisma.offboarding.findFirst({
    where: { id, organizationId: user.organizationId },
    include: {
      employee: {
        include: {
          department: { select: { name: true } },
          location: { select: { name: true } },
          user: { select: { id: true, email: true, status: true } },
        },
      },
    },
  });
  if (!offboarding) notFound();

  const employee = offboarding.employee;
  const now = new Date();
  const isOpen = offboarding.status === "OPEN" || offboarding.status === "IN_PROGRESS";
  const canManage = user.permissions.has("offboarding:manage");

  const [openAssignments, activeLicenses, activeShares] = await Promise.all([
    prisma.assetAssignment.findMany({
      where: {
        organizationId: user.organizationId,
        employeeId: employee.id,
        status: "CHECKED_OUT",
      },
      include: { asset: { select: { id: true, assetTag: true, name: true } } },
      orderBy: { assignedAt: "desc" },
    }),
    prisma.licenseAssignment.findMany({
      where: {
        employeeId: employee.id,
        revokedAt: null,
        license: { organizationId: user.organizationId },
      },
      include: { license: { select: { id: true, softwareName: true } } },
      orderBy: { assignedAt: "desc" },
    }),
    employee.userId
      ? prisma.vaultShare.findMany({
          where: {
            userId: employee.userId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            vaultItem: { organizationId: user.organizationId },
          },
          // Metadata only — never secret values.
          select: {
            id: true,
            permission: true,
            expiresAt: true,
            vaultItem: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const assetsDone = offboarding.assetsReturned || openAssignments.length === 0;
  const licensesDone = offboarding.licensesRevoked || activeLicenses.length === 0;
  const vaultDone = offboarding.vaultRevoked || activeShares.length === 0;
  const accountDone =
    offboarding.accountDisabled || !employee.user || employee.user.status !== "ACTIVE";
  const allDone = assetsDone && licensesDone && vaultDone && accountDone;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Offboarding: ${employee.firstName} ${employee.lastName}`}
        description={`${employee.employeeCode} · ${employee.department?.name ?? "-"} · เริ่ม ${formatDate(offboarding.createdAt)}`}
      >
        <StatusBadge status={offboarding.status} />
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>ข้อมูลพนักงาน / Employee</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">พนักงาน / Employee</dt>
              <dd>
                <Link href={`/employees/${employee.id}`} className="text-primary hover:underline">
                  {employee.firstName} {employee.lastName}
                </Link>{" "}
                <StatusBadge status={employee.status} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ตำแหน่ง / Position</dt>
              <dd>{employee.position ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">สถานที่ / Location</dt>
              <dd>{employee.location?.name ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">วันทำงานสุดท้าย / Last work date</dt>
              <dd>{formatDate(offboarding.lastWorkDate)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* a. Outstanding assets */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>ทรัพย์สินค้างคืน / Outstanding Assets ({openAssignments.length})</CardTitle>
            <SectionStatus done={assetsDone} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {openAssignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีทรัพย์สินค้างคืน / Nothing outstanding</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>ทรัพย์สิน / Asset</TableHead>
                  <TableHead>วันที่เบิก / Assigned</TableHead>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {canManage && isOpen && openAssignments.length > 0 && (
            <form action={returnAllAssets}>
              <input type="hidden" name="offboardingId" value={offboarding.id} />
              <ConfirmButton confirmText="รับคืนทรัพย์สินทั้งหมด? / Return all assets?">
                รับคืนทั้งหมด / Return all
              </ConfirmButton>
            </form>
          )}
        </CardContent>
      </Card>

      {/* b. Software licenses */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>ซอฟต์แวร์ไลเซนส์ / Software Licenses ({activeLicenses.length})</CardTitle>
            <SectionStatus done={licensesDone} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeLicenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">ไม่มีไลเซนส์ค้าง / Nothing outstanding</p>
          ) : (
            <ul className="list-inside list-disc text-sm">
              {activeLicenses.map((la) => (
                <li key={la.id}>
                  {la.license.softwareName}
                  <span className="ml-2 text-xs text-muted-foreground">
                    มอบเมื่อ / assigned {formatDate(la.assignedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canManage && isOpen && activeLicenses.length > 0 && (
            <form action={revokeAllLicenses}>
              <input type="hidden" name="offboardingId" value={offboarding.id} />
              <ConfirmButton confirmText="เพิกถอนไลเซนส์ทั้งหมด? / Revoke all licenses?">
                เพิกถอนทั้งหมด / Revoke all
              </ConfirmButton>
            </form>
          )}
        </CardContent>
      </Card>

      {/* c. Vault access */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>สิทธิ์เข้าถึง Vault / Vault Access ({activeShares.length})</CardTitle>
            <SectionStatus done={vaultDone} />
          </div>
          <CardDescription>
            แสดงเฉพาะข้อมูลเมตา ไม่แสดงค่าความลับ / Metadata only — secret values are never shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeShares.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {employee.userId
                ? "ไม่มีสิทธิ์ค้างอยู่ / Nothing outstanding"
                : "พนักงานไม่มีบัญชีผู้ใช้ / Employee has no user account"}
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {activeShares.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2">
                  <span>{s.vaultItem.name}</span>
                  <Badge variant="outline">{s.permission}</Badge>
                  <span className="text-xs text-muted-foreground">
                    หมดอายุ / expires: {s.expiresAt ? formatDateTime(s.expiresAt) : "ไม่หมดอายุ / never"}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {canManage && isOpen && activeShares.length > 0 && (
            <form action={revokeVaultAccess}>
              <input type="hidden" name="offboardingId" value={offboarding.id} />
              <ConfirmButton confirmText="เพิกถอนสิทธิ์ Vault ทั้งหมด? / Revoke all vault access?">
                เพิกถอนสิทธิ์ Vault / Revoke vault access
              </ConfirmButton>
            </form>
          )}
        </CardContent>
      </Card>

      {/* d. User account */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>บัญชีผู้ใช้ / User Account</CardTitle>
            <SectionStatus done={accountDone} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {employee.user ? (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              {employee.user.email} <StatusBadge status={employee.user.status} />
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              พนักงานไม่มีบัญชีผู้ใช้ / Employee has no user account
            </p>
          )}
          {canManage && isOpen && employee.user && employee.user.status === "ACTIVE" && (
            <form action={disableAccount}>
              <input type="hidden" name="offboardingId" value={offboarding.id} />
              <ConfirmButton
                variant="destructive"
                confirmText="ปิดบัญชีผู้ใช้และยกเลิกทุก session? / Disable account and revoke all sessions?"
              >
                ปิดบัญชี / Disable account
              </ConfirmButton>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Final actions */}
      {canManage && isOpen && (
        <Card>
          <CardHeader>
            <CardTitle>สรุป / Finalize</CardTitle>
            <CardDescription>
              {allDone
                ? "เช็คลิสต์ครบถ้วน พร้อมปิดงาน / Checklist complete — ready to finish."
                : "ต้องดำเนินการเช็คลิสต์ให้ครบก่อนปิดงาน / Complete all checklist sections first."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <form action={completeOffboarding}>
              <input type="hidden" name="offboardingId" value={offboarding.id} />
              <ConfirmButton
                disabled={!allDone}
                confirmText="ปิดงาน Offboarding? พนักงานจะเปลี่ยนสถานะเป็น RESIGNED / Complete offboarding? Employee becomes RESIGNED."
              >
                เสร็จสิ้น Offboarding / Complete offboarding
              </ConfirmButton>
            </form>
            <form action={cancelOffboarding}>
              <input type="hidden" name="offboardingId" value={offboarding.id} />
              <ConfirmButton
                variant="outline"
                confirmText="ยกเลิกกระบวนการ Offboarding? / Cancel this offboarding?"
              >
                ยกเลิก / Cancel
              </ConfirmButton>
            </form>
          </CardContent>
        </Card>
      )}

      {offboarding.status === "COMPLETED" && (
        <p className="text-sm text-muted-foreground">
          เสร็จสิ้นเมื่อ / Completed at {formatDateTime(offboarding.completedAt)}
        </p>
      )}
    </div>
  );
}
