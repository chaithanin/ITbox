import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma, CaseStatus, CasePriority } from "@prisma/client";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { createCase } from "@/lib/services/support";

const STATUSES = [
  "NEW",
  "TRIAGE",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_USER",
  "WAITING_VENDOR",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  "CANCELLED",
  "DUPLICATE",
] as const;

const PRIORITIES = ["P1", "P2", "P3", "P4"] as const;

export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("support:read");
  const sp = new URL(req.url).searchParams;

  const pageSize = 25;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const q = sp.get("q")?.trim() || undefined;
  const statusParam = sp.get("status") ?? undefined;
  const status = STATUSES.includes(statusParam as (typeof STATUSES)[number])
    ? (statusParam as CaseStatus)
    : undefined;
  const priorityParam = sp.get("priority") ?? undefined;
  const priority = PRIORITIES.includes(priorityParam as (typeof PRIORITIES)[number])
    ? (priorityParam as CasePriority)
    : undefined;

  const where: Prisma.SupportCaseWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { caseNumber: { contains: q, mode: "insensitive" } },
            { subject: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
  };

  const [cases, total] = await Promise.all([
    prisma.supportCase.findMany({
      where,
      orderBy: [{ priority: "asc" }, { resolutionDueAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        caseNumber: true,
        subject: true,
        priority: true,
        impact: true,
        status: true,
        source: true,
        firstResponseDueAt: true,
        resolutionDueAt: true,
        firstResponseBreached: true,
        resolutionBreached: true,
        resolvedAt: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
        type: { select: { name: true, nameTh: true } },
        category: { select: { name: true, nameTh: true } },
        assignedUser: { select: { name: true } },
      },
    }),
    prisma.supportCase.count({ where }),
  ]);

  return NextResponse.json({
    data: cases,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  });
});

const createSchema = z.object({
  subject: z.string().min(3).max(300),
  description: z.string().min(1).max(5000),
  typeId: z.string().uuid().nullish(),
  categoryId: z.string().uuid().nullish(),
  impact: z.enum(["UNUSABLE", "MAJOR", "PARTIAL", "GENERAL"]).nullish(),
  locationId: z.string().uuid().nullish(),
  assetId: z.string().uuid().nullish(),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("support:create");
  const input = createSchema.parse(await req.json());

  const created = await createCase(user, {
    subject: input.subject,
    description: input.description,
    typeId: input.typeId ?? null,
    categoryId: input.categoryId ?? null,
    impact: input.impact ?? null,
    locationId: input.locationId ?? null,
    assetId: input.assetId ?? null,
    source: "MANUAL",
  });

  return NextResponse.json({ id: created.id, caseNumber: created.caseNumber }, { status: 201 });
});
