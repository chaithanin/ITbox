import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const ASSET_STATUSES = [
  "AVAILABLE",
  "ASSIGNED",
  "IN_USE",
  "IN_REPAIR",
  "LOST",
  "STOLEN",
  "DAMAGED",
  "RETIRED",
  "DISPOSED",
] as const;

const ASSET_CONDITIONS = ["NEW", "GOOD", "FAIR", "DAMAGED", "CRITICAL"] as const;

/** Convert Prisma Decimal fields to plain numbers for JSON output. */
function serializeAsset<T extends { purchasePrice: unknown; currentValue: unknown }>(asset: T) {
  return {
    ...asset,
    purchasePrice: asset.purchasePrice != null ? Number(asset.purchasePrice) : null,
    currentValue: asset.currentValue != null ? Number(asset.currentValue) : null,
  };
}

export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("asset:read");
  const url = new URL(req.url);
  const sp = url.searchParams;

  const pageSize = 20;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const q = sp.get("q")?.trim() || undefined;
  const statusParam = sp.get("status") ?? undefined;
  const status = ASSET_STATUSES.includes(statusParam as (typeof ASSET_STATUSES)[number])
    ? (statusParam as (typeof ASSET_STATUSES)[number])
    : undefined;
  const categoryId = sp.get("categoryId")?.trim() || undefined;
  const departmentId = sp.get("departmentId")?.trim() || undefined;
  const locationId = sp.get("locationId")?.trim() || undefined;

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

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { assetTag: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        category: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
      },
    }),
    prisma.asset.count({ where }),
  ]);

  return NextResponse.json({
    data: assets.map((a) => serializeAsset(a)),
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  });
});

const createSchema = z.object({
  assetTag: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  serialNumber: z.string().nullish(),
  brand: z.string().nullish(),
  model: z.string().nullish(),
  specification: z.string().nullish(),
  categoryId: z.string().uuid().nullish(),
  departmentId: z.string().uuid().nullish(),
  locationId: z.string().uuid().nullish(),
  vendorId: z.string().uuid().nullish(),
  purchaseDate: z.coerce.date().nullish(),
  purchasePrice: z.coerce.number().nullish(),
  warrantyStart: z.coerce.date().nullish(),
  warrantyEnd: z.coerce.date().nullish(),
  invoiceNumber: z.string().nullish(),
  condition: z.enum(ASSET_CONDITIONS).optional(),
  status: z.enum(ASSET_STATUSES).optional(),
  costCenter: z.string().nullish(),
  project: z.string().nullish(),
  ipAddress: z.string().nullish(),
  notes: z.string().nullish(),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("asset:create");
  const input = createSchema.parse(await req.json());

  const dup = await prisma.asset.findFirst({
    where: { organizationId: user.organizationId, assetTag: input.assetTag, deletedAt: null },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json({ error: "asset_tag_exists" }, { status: 409 });
  }

  const asset = await prisma.asset.create({
    data: {
      organizationId: user.organizationId,
      assetTag: input.assetTag,
      name: input.name,
      serialNumber: input.serialNumber ?? null,
      brand: input.brand ?? null,
      model: input.model ?? null,
      specification: input.specification ?? null,
      categoryId: input.categoryId ?? null,
      departmentId: input.departmentId ?? null,
      locationId: input.locationId ?? null,
      vendorId: input.vendorId ?? null,
      purchaseDate: input.purchaseDate ?? null,
      purchasePrice: input.purchasePrice ?? null,
      warrantyStart: input.warrantyStart ?? null,
      warrantyEnd: input.warrantyEnd ?? null,
      invoiceNumber: input.invoiceNumber ?? null,
      condition: input.condition ?? "NEW",
      status: input.status ?? "AVAILABLE",
      costCenter: input.costCenter ?? null,
      project: input.project ?? null,
      ipAddress: input.ipAddress ?? null,
      notes: input.notes ?? null,
    },
  });
  await prisma.assetHistory.create({
    data: {
      organizationId: user.organizationId,
      assetId: asset.id,
      action: "REGISTER",
      detail: `ลงทะเบียนทรัพย์สิน / Registered asset ${asset.assetTag} (API)`,
      actorId: user.id,
    },
  });
  await auditLog(user, {
    action: "CREATE",
    entityType: "ASSET",
    entityId: asset.id,
    detail: { assetTag: asset.assetTag, name: asset.name, via: "api" },
  });

  return NextResponse.json({ data: serializeAsset(asset) }, { status: 201 });
});
