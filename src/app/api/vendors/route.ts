import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("vendor:read");
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));
  const q = sp.get("q")?.trim() || undefined;

  const where = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { category: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.vendor.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.vendor.count({ where }),
  ]);

  return NextResponse.json({
    data,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  });
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).nullish(),
  phone: z.string().max(50).nullish(),
  email: z.string().email().max(320).nullish(),
  address: z.string().max(2000).nullish(),
  taxId: z.string().max(50).nullish(),
  category: z.string().max(100).nullish(),
  rating: z.number().int().min(1).max(5).nullish(),
  notes: z.string().max(5000).nullish(),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("vendor:manage");
  const input = createSchema.parse(await req.json());

  const vendor = await prisma.vendor.create({
    data: {
      organizationId: user.organizationId,
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      taxId: input.taxId ?? null,
      category: input.category ?? null,
      rating: input.rating ?? null,
      notes: input.notes ?? null,
    },
  });

  await auditLog(user, {
    action: "CREATE",
    entityType: "VENDOR",
    entityId: vendor.id,
    detail: { name: vendor.name, via: "api" },
  });

  return NextResponse.json({ data: vendor }, { status: 201 });
});
