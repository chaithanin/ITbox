import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

const bodySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  division: z.string().max(200).nullish(),
  costCenter: z.string().max(100).nullish(),
});

export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("department:read");
  const sp = new URL(req.url).searchParams;

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));
  const q = sp.get("q")?.trim() || undefined;

  const where: Prisma.DepartmentWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.department.findMany({
      where,
      include: {
        _count: {
          select: {
            employees: { where: { deletedAt: null } },
            assets: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { code: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.department.count({ where }),
  ]);

  return NextResponse.json({
    data,
    page,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  });
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("department:manage");
  const input = bodySchema.parse(await req.json());

  const dup = await prisma.department.findFirst({
    where: { organizationId: user.organizationId, code: input.code, deletedAt: null },
    select: { id: true },
  });
  if (dup) return NextResponse.json({ error: "department_code_exists" }, { status: 409 });

  const row = await prisma.department.create({
    data: {
      organizationId: user.organizationId,
      code: input.code,
      name: input.name,
      division: input.division ?? null,
      costCenter: input.costCenter ?? null,
    },
  });
  await auditLog(user, {
    action: "CREATE",
    entityType: "DEPARTMENT",
    entityId: row.id,
    detail: { code: row.code, name: row.name, via: "api" },
  });
  return NextResponse.json({ data: row }, { status: 201 });
});
