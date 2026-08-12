import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import type { Prisma } from "@prisma/client";

const STATUS = ["ACTIVE", "ON_LEAVE", "OFFBOARDING", "RESIGNED"] as const;

const employeeBodySchema = z.object({
  employeeCode: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.email().nullish(),
  phone: z.string().max(50).nullish(),
  position: z.string().max(200).nullish(),
  departmentId: z.uuid().nullish(),
  locationId: z.uuid().nullish(),
  managerId: z.uuid().nullish(),
  status: z.enum(STATUS).default("ACTIVE"),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
});

export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("employee:read");
  const sp = new URL(req.url).searchParams;

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));
  const q = sp.get("q")?.trim() || undefined;
  const departmentId = sp.get("departmentId") || undefined;
  const statusParam = sp.get("status") ?? undefined;
  const status = STATUS.includes(statusParam as (typeof STATUS)[number])
    ? (statusParam as (typeof STATUS)[number])
    : undefined;

  const where: Prisma.EmployeeWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(departmentId ? { departmentId } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { employeeCode: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        department: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
      },
      orderBy: { employeeCode: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.employee.count({ where }),
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
  const user = await requirePermission("employee:create");
  const input = employeeBodySchema.parse(await req.json());

  const dup = await prisma.employee.findFirst({
    where: {
      organizationId: user.organizationId,
      employeeCode: input.employeeCode,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json({ error: "employee_code_exists" }, { status: 409 });
  }

  // Validate org-scoped references
  if (input.departmentId) {
    const d = await prisma.department.findFirst({
      where: { id: input.departmentId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!d) return NextResponse.json({ error: "invalid_department" }, { status: 400 });
  }
  if (input.locationId) {
    const l = await prisma.location.findFirst({
      where: { id: input.locationId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!l) return NextResponse.json({ error: "invalid_location" }, { status: 400 });
  }
  if (input.managerId) {
    const m = await prisma.employee.findFirst({
      where: { id: input.managerId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!m) return NextResponse.json({ error: "invalid_manager" }, { status: 400 });
  }

  const row = await prisma.employee.create({
    data: {
      organizationId: user.organizationId,
      employeeCode: input.employeeCode,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      position: input.position ?? null,
      departmentId: input.departmentId ?? null,
      locationId: input.locationId ?? null,
      managerId: input.managerId ?? null,
      status: input.status,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
    },
  });
  await auditLog(user, {
    action: "CREATE",
    entityType: "EMPLOYEE",
    entityId: row.id,
    detail: { employeeCode: row.employeeCode, name: `${row.firstName} ${row.lastName}`, via: "api" },
  });
  return NextResponse.json({ data: row }, { status: 201 });
});
