import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Download, Plus, Upload } from "lucide-react";
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
  // Dashboard alert deep-links: warranty=expired (in-use, past warranty),
  // age=old (in service, purchased over 4 years ago).
  const now = new Date();
  const fourYearsAgo = new Date(now.getTime() - 4 * 365 * 24 * 3600 * 1000);
  const warrantyExpired = sp.warranty === "expired";
  const ageOld = sp.age === "old";

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
    ...(warrantyExpired ? { warrantyEnd: { lt: now }, status: { in: ["IN_USE", "ASSIGNED"] } } : {}),
    ...(ageOld ? { purchaseDate: { lt: fourYearsAgo }, status: { notIn: ["RETIRED", "DISPOSED"] } } : {}),
  };

  const [assets, total, categories, departments, locations, statusGroups, categoryGroups, valueAgg, orgTotal] = await Promise.all([
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
    // Org-wide summary (independent of the current filter)
    prisma.asset.groupBy({ by: ["status"], where: { organizationId: user.organizationId, deletedAt: null }, _count: true }),
    prisma.asset.groupBy({ by: ["categoryId"], where: { organizationId: user.organizationId, deletedAt: null }, _count: true }),
    prisma.asset.aggregate({ where: { organizationId: user.organizationId, deletedAt: null }, _sum: { purchasePrice: true } }),
    prisma.asset.count({ where: { organizationId: user.organizationId, deletedAt: null } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / take));

  // ---- summary dashboard (org-wide) ----
  const sc = new Map(statusGroups.map((g) => [g.status, g._count]));
  const sumInUse = (sc.get("IN_USE") ?? 0) + (sc.get("ASSIGNED") ?? 0);
  const sumAvail = sc.get("AVAILABLE") ?? 0;
  const sumRepair = sc.get("IN_REPAIR") ?? 0;
  const sumBad = (sc.get("DAMAGED") ?? 0) + (sc.get("LOST") ?? 0) + (sc.get("STOLEN") ?? 0);
  const sumRetired = (sc.get("RETIRED") ?? 0) + (sc.get("DISPOSED") ?? 0);
  const totalValue = Number(valueAgg._sum.purchasePrice ?? 0);
  const fmtBaht = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toLocaleString());
  const catNameById = new Map(categories.map((c) => [c.id, c.name]));
  const catBars = categoryGroups
    .filter((g) => g._count > 0)
    .map((g) => ({ name: g.categoryId ? catNameById.get(g.categoryId) ?? "—" : "ไม่ระบุ", count: g._count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const catMax = Math.max(1, ...catBars.map((c) => c.count));
  const SUMMARY: { label: string; value: number | string; href?: string; tone: string }[] = [
    { label: "ทั้งหมด / Total", value: orgTotal, tone: "text-sky-600" },
    { label: "ใช้งาน / In Use", value: sumInUse, href: "/assets?status=IN_USE", tone: "text-blue-600" },
    { label: "ว่าง / Available", value: sumAvail, href: "/assets?status=AVAILABLE", tone: "text-emerald-600" },
    { label: "ซ่อม / In Repair", value: sumRepair, href: "/assets?status=IN_REPAIR", tone: "text-amber-600" },
    { label: "ชำรุด/สูญหาย", value: sumBad, tone: "text-red-600" },
    { label: "มูลค่ารวม / Value", value: `฿${fmtBaht(totalValue)}`, tone: "text-rose-600" },
  ];

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
          <>
            <Button variant="outline" asChild>
              <Link href="/assets/import">
                <Upload className="h-4 w-4" />
                นำเข้า CSV / Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/assets/new">
                <Plus className="h-4 w-4" />
                สร้างทรัพย์สิน / New Asset
              </Link>
            </Button>
          </>
        )}
      </PageHeader>

      {/* Summary dashboard (org-wide) */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {SUMMARY.map((s) => {
          const body = (
            <>
              <p className={cn("text-2xl font-bold leading-none", s.tone)}>{s.value}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">{s.label}</p>
            </>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent">
              {body}
            </Link>
          ) : (
            <div key={s.label} className="rounded-lg border bg-card p-4">{body}</div>
          );
        })}
      </div>

      {catBars.length > 0 && (
        <div className="mb-5 rounded-lg border bg-card p-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">แยกตามหมวดหมู่ / By Category</p>
          <div className="space-y-2.5">
            {catBars.map((c) => (
              <Link
                key={c.name}
                href={`/assets?categoryId=${encodeURIComponent(categories.find((x) => x.name === c.name)?.id ?? "")}`}
                className="flex items-center gap-3 text-xs hover:opacity-80"
              >
                <span className="w-32 shrink-0 truncate text-muted-foreground">{c.name}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.round((c.count / catMax) * 100)}%` }} />
                </div>
                <span className="w-10 shrink-0 text-right font-medium tabular-nums">{c.count}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

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

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>แท็ก / assetTag</TableHead>
              <TableHead>ชื่อ / name</TableHead>
              <TableHead>ซีเรียล / serialNumber</TableHead>
              <TableHead>หมวดหมู่ / category</TableHead>
              <TableHead>สถานะ / status</TableHead>
              <TableHead>สภาพ / condition</TableHead>
              <TableHead>แผนก / department</TableHead>
              <TableHead>สถานที่ / location</TableHead>
              <TableHead>ผู้ถือครอง / assignedTo</TableHead>
              <TableHead>วันซื้อ / purchaseDate</TableHead>
              <TableHead className="text-right">ราคา / purchasePrice</TableHead>
              <TableHead>หมดประกัน / warrantyEnd</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="py-8 text-center text-muted-foreground">
                  ไม่พบทรัพย์สิน / No assets found
                </TableCell>
              </TableRow>
            )}
            {assets.map((a) => {
              const holder = a.assignments[0]?.employee;
              const d = daysUntil(a.warrantyEnd);
              return (
                <TableRow key={a.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/assets/${a.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                      {a.assetTag}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{a.name}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">{a.serialNumber || "-"}</TableCell>
                  <TableCell className="whitespace-nowrap">{a.category?.name ?? "-"}</TableCell>
                  <TableCell><StatusBadge status={a.status} /></TableCell>
                  <TableCell className="whitespace-nowrap">{a.condition}</TableCell>
                  <TableCell className="whitespace-nowrap">{a.department?.name ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap">{a.location?.name ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap">{holder ? `${holder.firstName} ${holder.lastName}` : "-"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(a.purchaseDate)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {a.purchasePrice != null ? Number(a.purchasePrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "whitespace-nowrap",
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
      </div>

      <Pagination
        page={page}
        pageCount={pageCount}
        basePath="/assets"
        searchParams={{ q, status, categoryId, departmentId, locationId }}
      />
    </div>
  );
}
