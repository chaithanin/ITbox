import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("subscription:read");
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));
  const q = sp.get("q")?.trim() || undefined;
  const status = sp.get("status");

  const where = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q ? { serviceName: { contains: q, mode: "insensitive" as const } } : {}),
    ...(status === "ACTIVE" || status === "CANCELLED" || status === "EXPIRED"
      ? { status: status as "ACTIVE" | "CANCELLED" | "EXPIRED" }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.subscription.findMany({
      where,
      include: { vendor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.subscription.count({ where }),
  ]);

  return NextResponse.json({
    data,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  });
});

const createSchema = z.object({
  serviceName: z.string().min(1).max(200),
  vendorId: z.string().nullish(),
  plan: z.string().max(200).nullish(),
  quantity: z.number().int().min(1).max(100000).default(1),
  cost: z.number().min(0).nullish(),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]).nullish(),
  startDate: z.coerce.date().nullish(),
  renewalDate: z.coerce.date().nullish(),
  status: z.enum(["ACTIVE", "CANCELLED", "EXPIRED"]).default("ACTIVE"),
  notes: z.string().max(5000).nullish(),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("subscription:manage");
  const input = createSchema.parse(await req.json());

  let vendorId: string | null = null;
  if (input.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    vendorId = vendor?.id ?? null;
  }

  const sub = await prisma.subscription.create({
    data: {
      organizationId: user.organizationId,
      serviceName: input.serviceName,
      vendorId,
      plan: input.plan ?? null,
      quantity: input.quantity,
      cost: input.cost ?? null,
      billingCycle: input.billingCycle ?? null,
      startDate: input.startDate ?? null,
      renewalDate: input.renewalDate ?? null,
      status: input.status,
      notes: input.notes ?? null,
    },
  });

  await auditLog(user, {
    action: "CREATE",
    entityType: "SUBSCRIPTION",
    entityId: sub.id,
    detail: { serviceName: sub.serviceName, via: "api" },
  });

  return NextResponse.json({ data: sub }, { status: 201 });
});
