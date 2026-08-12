import { NextResponse } from "next/server";
import { z } from "zod";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function serializeAsset<T extends { purchasePrice: unknown; currentValue: unknown }>(asset: T) {
  return {
    ...asset,
    purchasePrice: asset.purchasePrice != null ? Number(asset.purchasePrice) : null,
    currentValue: asset.currentValue != null ? Number(asset.currentValue) : null,
  };
}

type Ctx = { params: Promise<{ id: string }> };

export const GET = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requirePermission("asset:read");
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      category: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
      assignments: {
        where: { status: "CHECKED_OUT" },
        orderBy: { assignedAt: "desc" },
        take: 1,
        select: {
          id: true,
          assignedAt: true,
          employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!asset) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ data: serializeAsset(asset) });
});

const updateSchema = z.object({
  assetTag: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
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

export const PUT = apiHandler(async (req: Request, { params }: Ctx) => {
  const user = await requirePermission("asset:update");
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const existing = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, assetTag: true },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const input = updateSchema.parse(await req.json());

  if (input.assetTag && input.assetTag !== existing.assetTag) {
    const dup = await prisma.asset.findFirst({
      where: {
        organizationId: user.organizationId,
        assetTag: input.assetTag,
        deletedAt: null,
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) return NextResponse.json({ error: "asset_tag_exists" }, { status: 409 });
  }

  const asset = await prisma.asset.update({
    where: { id },
    data: input,
  });
  await prisma.assetHistory.create({
    data: {
      organizationId: user.organizationId,
      assetId: asset.id,
      action: "UPDATE",
      detail: `แก้ไขข้อมูลทรัพย์สิน / Updated asset ${asset.assetTag} (API)`,
      actorId: user.id,
    },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "ASSET",
    entityId: asset.id,
    detail: { assetTag: asset.assetTag, fields: Object.keys(input), via: "api" },
  });

  return NextResponse.json({ data: serializeAsset(asset) });
});

export const DELETE = apiHandler(async (_req: Request, { params }: Ctx) => {
  const user = await requirePermission("asset:delete");
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, assetTag: true },
  });
  if (!asset) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.asset.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, {
    action: "DELETE",
    entityType: "ASSET",
    entityId: id,
    detail: { assetTag: asset.assetTag, via: "api" },
  });

  return NextResponse.json({ ok: true });
});
