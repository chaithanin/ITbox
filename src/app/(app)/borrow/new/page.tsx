import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { BorrowRequestForm, type EmployeeOption, type AssetOption } from "../borrow-request-form";

export const dynamic = "force-dynamic";

export default async function NewBorrowRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("borrow:create")) {
    return <p className="text-sm text-muted-foreground">คุณไม่มีสิทธิ์สร้างคำขอยืม / You cannot create borrow requests.</p>;
  }
  const sp = await searchParams;
  const canPickRequester = user.permissions.has("employee:read");

  // Requester options: everyone can search employees when they may borrow on
  // behalf of others; a plain employee only ever borrows for themselves.
  const [employees, assets, self] = await Promise.all([
    canPickRequester
      ? prisma.employee.findMany({
          where: { organizationId: user.organizationId, deletedAt: null, status: "ACTIVE" },
          select: {
            id: true, employeeCode: true, firstName: true, lastName: true, position: true,
            phone: true, email: true, department: { select: { name: true } },
          },
          orderBy: { firstName: "asc" },
          take: 2000,
        })
      : Promise.resolve([]),
    prisma.asset.findMany({
      where: { organizationId: user.organizationId, deletedAt: null, status: "AVAILABLE" },
      select: {
        id: true, assetTag: true, name: true, serialNumber: true,
        category: { select: { name: true } },
      },
      orderBy: { assetTag: "asc" },
      take: 1000,
    }),
    user.employeeId
      ? prisma.employee.findFirst({
          where: { id: user.employeeId, organizationId: user.organizationId, deletedAt: null },
          select: {
            id: true, employeeCode: true, firstName: true, lastName: true, position: true,
            phone: true, email: true, department: { select: { name: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  const toOption = (e: NonNullable<typeof self>): EmployeeOption => ({
    id: e.id, code: e.employeeCode, name: `${e.firstName} ${e.lastName}`.trim(),
    position: e.position, phone: e.phone, email: e.email, departmentName: e.department?.name ?? null,
  });

  const empOptions: EmployeeOption[] = canPickRequester
    ? (employees as NonNullable<typeof self>[]).map(toOption)
    : self ? [toOption(self)] : [];
  const assetOptions: AssetOption[] = assets.map((a) => ({
    id: a.id, assetTag: a.assetTag, name: a.name, serialNumber: a.serialNumber,
    categoryName: a.category?.name ?? null,
  }));

  // Pre-select an asset when arriving from a QR scan (?assetId=...).
  const prefill = sp.assetId ? assetOptions.filter((a) => a.id === sp.assetId) : [];

  if (!canPickRequester && !self) {
    return (
      <div>
        <PageHeader title="ขอยืมทรัพย์สิน / New Borrow Request" />
        <p className="text-sm text-amber-600">
          บัญชีของคุณยังไม่ได้เชื่อมกับข้อมูลพนักงาน กรุณาติดต่อฝ่าย IT / Your account is not linked to an
          employee record. Please contact IT.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/borrow" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> กลับ / Back
      </Link>
      <PageHeader
        title="ขอยืมทรัพย์สิน / New Borrow Request"
        description="กรอกข้อมูลผู้ขอและเลือกทรัพย์สินที่ต้องการยืม / Fill in the requester and select assets to borrow"
      />
      {sp.error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {sp.error}
        </div>
      )}
      <BorrowRequestForm
        employees={empOptions}
        assets={assetOptions}
        defaultRequesterId={!canPickRequester && self ? self.id : undefined}
        defaultAssets={prefill}
        canPickRequester={canPickRequester}
      />
    </div>
  );
}
