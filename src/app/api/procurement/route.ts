import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const STATUSES = [
  "DRAFT",
  "PENDING_MANAGER",
  "PENDING_IT",
  "PENDING_FINANCE",
  "APPROVED",
  "REJECTED",
  "ORDERED",
  "RECEIVED",
  "REGISTERED",
  "CANCELLED",
] as const;

export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("procurement:read");
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));
  const q = sp.get("q")?.trim() || undefined;
  const status = STATUSES.find((s) => s === sp.get("status"));

  const where = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q ? { requestNumber: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        vendor: { select: { id: true, name: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchaseRequest.count({ where }),
  ]);

  return NextResponse.json({
    data,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  });
});

const createSchema = z.object({
  reason: z.string().min(1).max(5000),
  departmentId: z.string().nullish(),
  vendorId: z.string().nullish(),
  items: z
    .array(
      z.object({
        description: z.string().min(1).max(1000),
        quantity: z.number().int().min(1).max(100000).default(1),
        estimatedCost: z.number().min(0).nullish(),
      })
    )
    .min(1)
    .max(5),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("procurement:create");
  const input = createSchema.parse(await req.json());

  let departmentId: string | null = null;
  if (input.departmentId) {
    const dep = await prisma.department.findFirst({
      where: { id: input.departmentId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    departmentId = dep?.id ?? null;
  }
  let vendorId: string | null = null;
  if (input.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    vendorId = vendor?.id ?? null;
  }

  const totalEstimated = input.items.reduce(
    (sum, it) => sum + (it.estimatedCost ?? 0) * it.quantity,
    0
  );

  const year = new Date().getFullYear();
  const prefix = `PR-${year}-`;
  const count = await prisma.purchaseRequest.count({
    where: { organizationId: user.organizationId, requestNumber: { startsWith: prefix } },
  });

  let request = null;
  for (let attempt = 0; attempt < 10 && !request; attempt++) {
    const requestNumber = `${prefix}${String(count + 1 + attempt).padStart(4, "0")}`;
    try {
      request = await prisma.purchaseRequest.create({
        data: {
          organizationId: user.organizationId,
          requestNumber,
          requesterId: user.id,
          departmentId,
          vendorId,
          reason: input.reason,
          status: "PENDING_MANAGER",
          totalEstimated,
          items: {
            create: input.items.map((it) => ({
              description: it.description,
              quantity: it.quantity,
              estimatedCost: it.estimatedCost ?? null,
            })),
          },
        },
        include: { items: true },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  if (!request) {
    return NextResponse.json({ error: "request_number_allocation_failed" }, { status: 500 });
  }

  await prisma.approval.createMany({
    data: [
      { step: 1, stepName: "MANAGER" },
      { step: 2, stepName: "IT" },
      { step: 3, stepName: "FINANCE" },
    ].map((s) => ({
      organizationId: user.organizationId,
      subjectType: "PURCHASE_REQUEST",
      subjectId: request.id,
      purchaseRequestId: request.id,
      step: s.step,
      stepName: s.stepName,
      decision: "PENDING" as const,
    })),
  });

  const approvers = await prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: "ACTIVE",
      userRoles: {
        some: { role: { key: { in: ["MANAGER", "IT_MANAGER", "FINANCE"] }, deletedAt: null } },
      },
    },
    select: { id: true },
  });
  if (approvers.length > 0) {
    await prisma.notification.createMany({
      data: approvers.map((a) => ({
        organizationId: user.organizationId,
        userId: a.id,
        type: "APPROVAL_PENDING",
        level: "INFO" as const,
        title: `คำขอจัดซื้อรออนุมัติ / Purchase request ${request.requestNumber} pending approval`,
        body: input.reason.slice(0, 500),
        link: `/procurement/${request.id}`,
      })),
    });
  }

  await auditLog(user, {
    action: "CREATE",
    entityType: "PURCHASE_REQUEST",
    entityId: request.id,
    detail: { requestNumber: request.requestNumber, totalEstimated, via: "api" },
  });

  return NextResponse.json({ data: request }, { status: 201 });
});
