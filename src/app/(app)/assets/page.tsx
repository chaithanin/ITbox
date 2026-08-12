import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Download, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { cn, daysUntil, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { SearchFilterBar, Pagination, parsePage } from "@/components/list-controls";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ASSET_STATUSES } from "./asset-form-fields";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("asset:read")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  const sp = await searchParams;
  const { page, skip, take } = parsePage(sp.page);
  const q = sp.q?.trim() || undefined;
  const status = ASSET_STATUSES.includes(sp.status as (typeof ASSET_STATUSES)[number])
    ? (sp.status as (typeof ASSET_STATUSES)[number])
    : undefined;
  const categoryId = sp.categoryId?.trim() || undefined;
  const departmentId = sp.departmentId?.trim() || undefined;
  const locationId = sp.locationId?.trim() || undefined;

  const where: Prisma.AssetWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { assetTag: { contains: q, mode: "insensitive" } },
            { serialNumber: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(departmentId ? { departmentId } : {}),
    ...(locationId ? { locationId } : {}),
  };

  const [assets, total, categories, departments, locations] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { assetTag: "asc" },
      skip,
      take,
      include: {
        category: { select: { name: true } },
        department: { select: { name: true } },
        location: { select: { name: true } },
        assignments: {
          where: { status: "CHECKED_OUT" },
          orderBy: { assignedAt: "desc" },
          take: 1,
          select: { employee: { select: { firstName: true, lastName: true } } },
        },
      },
    }),
    prisma.asset.count({ where }),
    prisma.assetCategory.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.department.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.location.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / take));

  return (
    <div>
      <PageHeader
        title="ทรัพย์สิน / Assets"
        description={`ทั้งหมด ${total} รายการ / ${total} items`}
      >
        {user.permissions.has("asset:export") && (
          <Button variant="outline" asChild>
            <a href="/api/assets/export">
              <Download className="h-4 w-4" />
              ส่งออก CSV / Export CSV
            </a>
          </Button>
        )}
        {user.permissions.has("asset:create") && (
          <Button asChild>
            <Link href="/assets/new">
              <Plus className="h-4 w-4" />
              สร้างทรัพย์สิน / New Asset
            </Link>
          </Button>
        )}
      </PageHeader>

      <SearchFilterBar
        action="/assets"
        q={q}
        placeholder="ค้นหา แท็ก/ซีเรียล/ชื่อ / Search tag, serial, name..."
        filters={[
          {
            name: "status",
            value: status,
            allLabel: "สถานะทั้งหมด / All statuses",
            options: ASSET_STATUSES.map((s) => ({ value: s, label: s.replaceAll("_", " ") })),
          },
          {
            name: "categoryId",
            value: categoryId,
            allLabel: "ทุกหมวดหมู่ / All categories",
            options: categories.map((c) => ({ value: c.id, label: c.name })),
          },
          {
            name: "departmentId",
            value: departmentId,
            allLabel: "ทุกแผนก / All departments",
            options: departments.map((d) => ({ value: d.id, label: d.name })),
          },
          {
            name: "locationId",
            value: locationId,
            allLabel: "ทุกสถานที่ / All locations",
            options: locations.map((l) => ({ value: l.id, label: l.name })),
          },
        ]}
      />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>แท็ก / Tag</TableHead>
            <TableHead>ชื่อ / Name</TableHead>
            <TableHead>หมวดหมู่ / Category</TableHead>
            <TableHead>สถานะ / Status</TableHead>
            <TableHead>สภาพ / Condition</TableHead>
            <TableHead>แผนก / Department</TableHead>
            <TableHead>สถานที่ / Location</TableHead>
            <TableHead>ผู้ถือครอง / Assigned To</TableHead>
            <TableHead>หมดประกัน / Warranty End</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                ไม่พบทรัพย์สิน / No assets found
              </TableCell>
            </TableRow>
          )}
          {assets.map((a) => {
            const holder = a.assignments[0]?.employee;
            const d = daysUntil(a.warrantyEnd);
            return (
              <TableRow key={a.id}>
                <TableCell>
                  <Link href={`/assets/${a.id}`} className="font-medium text-primary hover:underline">
                    {a.assetTag}
                  </Link>
                </TableCell>
                <TableCell>{a.name}</TableCell>
                <TableCell>{a.category?.name ?? "-"}</TableCell>
                <TableCell>
                  <StatusBadge status={a.status} />
                </TableCell>
                <TableCell>{a.condition}</TableCell>
                <TableCell>{a.department?.name ?? "-"}</TableCell>
                <TableCell>{a.location?.name ?? "-"}</TableCell>
                <TableCell>{holder ? `${holder.firstName} ${holder.lastName}` : "-"}</TableCell>
                <TableCell
                  className={cn(
                    d !== null && d < 0 && "text-destructive",
                    d !== null && d >= 0 && d < 30 && "text-amber-600 dark:text-amber-400"
                  )}
                >
                  {formatDate(a.warrantyEnd)}
                  {d !== null && d >= 0 && d < 30 && (
                    <span className="ml-1 text-xs">({d} วัน / days)</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Pagination
        page={page}
        pageCount={pageCount}
        basePath="/assets"
        searchParams={{ q, status, categoryId, departmentId, locationId }}
      />
    </div>
  );
}
