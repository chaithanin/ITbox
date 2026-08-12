import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("license:read");
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));
  const q = sp.get("q")?.trim() || undefined;

  const where = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q ? { softwareName: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.license.findMany({
      where,
      select: {
        id: true,
        softwareName: true,
        vendorId: true,
        licenseType: true,
        totalSeats: true,
        purchaseDate: true,
        startDate: true,
        expiresAt: true,
        cost: true,
        renewalCost: true,
        autoRenewal: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { assignments: { where: { revokedAt: null } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.license.count({ where }),
  ]);

  return NextResponse.json({
    data,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  });
});

const createSchema = z.object({
  softwareName: z.string().min(1).max(200),
  vendorId: z.string().nullish(),
  licenseType: z.enum(["PERPETUAL", "SUBSCRIPTION", "OEM", "VOLUME"]).nullish(),
  totalSeats: z.number().int().min(1).max(100000).default(1),
  purchaseDate: z.coerce.date().nullish(),
  startDate: z.coerce.date().nullish(),
  expiresAt: z.coerce.date().nullish(),
  cost: z.number().min(0).nullish(),
  renewalCost: z.number().min(0).nullish(),
  autoRenewal: z.boolean().default(false),
  notes: z.string().max(5000).nullish(),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("license:manage");
  const input = createSchema.parse(await req.json());

  let vendorId: string | null = null;
  if (input.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    vendorId = vendor?.id ?? null;
  }

  const license = await prisma.license.create({
    data: {
      organizationId: user.organizationId,
      softwareName: input.softwareName,
      vendorId,
      licenseType: input.licenseType ?? null,
      totalSeats: input.totalSeats,
      purchaseDate: input.purchaseDate ?? null,
      startDate: input.startDate ?? null,
      expiresAt: input.expiresAt ?? null,
      cost: input.cost ?? null,
      renewalCost: input.renewalCost ?? null,
      autoRenewal: input.autoRenewal,
      notes: input.notes ?? null,
    },
  });

  await auditLog(user, {
    action: "CREATE",
    entityType: "LICENSE",
    entityId: license.id,
    detail: { softwareName: license.softwareName, via: "api" },
  });

  return NextResponse.json({ data: license }, { status: 201 });
});
