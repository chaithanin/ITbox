import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatDate, daysUntil } from "@/lib/utils";

const LICENSE_TYPE_LABELS: Record<string, string> = {
  PERPETUAL: "Perpetual",
  SUBSCRIPTION: "Subscription",
  OEM: "OEM",
  VOLUME: "Volume",
};

export default async function LicensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("license:read")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const q = sp.q?.trim() || undefined;
  const { page, skip, take } = parsePage(sp.page);

  const where = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { softwareName: { contains: q, mode: "insensitive" as const } },
            { vendor: { is: { name: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const in30d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const [licenses, total, totalLicenses, seatsUsed, expiringSoon] = await Promise.all([
    prisma.license.findMany({
      where,
      include: {
        vendor: { select: { name: true } },
        _count: { select: { assignments: { where: { revokedAt: null } } } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.license.count({ where }),
    prisma.license.count({
      where: { organizationId: user.organizationId, deletedAt: null },
    }),
    prisma.licenseAssignment.count({
      where: {
        revokedAt: null,
        license: { organizationId: user.organizationId, deletedAt: null },
      },
    }),
    prisma.license.count({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        expiresAt: { gte: new Date(), lte: in30d },
      },
    }),
  ]);

  const canManage = user.permissions.has("license:manage");
  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader
        title="ลิขสิทธิ์ซอฟต์แวร์ / Software Licenses"
        description="จัดการลิขสิทธิ์และการมอบหมายที่นั่ง / Manage licenses and seat assignments"
      >
        {canManage && (
          <>
            <Button variant="outline" asChild>
              <Link href="/licenses/import">
                <Upload className="h-4 w-4" /> นำเข้า / Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/licenses/new">
                <Plus className="h-4 w-4" /> เพิ่มลิขสิทธิ์ / New License
              </Link>
            </Button>
          </>
        )}
      </PageHeader>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="ลิขสิทธิ์ทั้งหมด / Total Licenses" value={totalLicenses} />
        <StatCard label="ที่นั่งที่ใช้งาน / Seats Used" value={seatsUsed} />
        <StatCard
          label="หมดอายุใน 30 วัน / Expiring in 30 days"
          value={expiringSoon}
          tone={expiringSoon > 0 ? "warning" : "default"}
        />
      </div>

      <SearchFilterBar action="/licenses" q={q} placeholder="ค้นหาซอฟต์แวร์ / Search software..." />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ซอฟต์แวร์ / Software</TableHead>
            <TableHead>ผู้จำหน่าย / Vendor</TableHead>
            <TableHead>ประเภท / Type</TableHead>
            <TableHead>ที่นั่ง / Seats</TableHead>
            <TableHead>หมดอายุ / Expires</TableHead>
            <TableHead>ต่ออายุอัตโนมัติ / Auto-renew</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {licenses.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                ไม่พบข้อมูล / No licenses found
              </TableCell>
            </TableRow>
          )}
          {licenses.map((l) => {
            const days = daysUntil(l.expiresAt);
            return (
              <TableRow key={l.id}>
                <TableCell>
                  <Link href={`/licenses/${l.id}`} className="font-medium text-primary hover:underline">
                    {l.softwareName}
                  </Link>
                </TableCell>
                <TableCell>{l.vendor?.name ?? "-"}</TableCell>
                <TableCell>
                  {l.licenseType ? LICENSE_TYPE_LABELS[l.licenseType] ?? l.licenseType : "-"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {l._count.assignments} / {l.totalSeats}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    {formatDate(l.expiresAt)}
                    {days !== null && days < 0 && (
                      <Badge variant="destructive">หมดอายุ / Expired</Badge>
                    )}
                    {days !== null && days >= 0 && days < 30 && (
                      <Badge variant="warning">{days} วัน / days</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  {l.autoRenewal ? (
                    <Badge variant="success">เปิด / On</Badge>
                  ) : (
                    <Badge variant="outline">ปิด / Off</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Pagination page={page} pageCount={pageCount} basePath="/licenses" searchParams={sp} />
    </div>
  );
}
