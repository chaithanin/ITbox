import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const STATUS = ["ACTIVE", "ON_LEAVE", "OFFBOARDING", "RESIGNED"] as const;

const updateSchema = z.object({
  employeeCode: z.string().min(1).max(50).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.email().nullish(),
  phone: z.string().max(50).nullish(),
  position: z.string().max(200).nullish(),
  departmentId: z.uuid().nullish(),
  locationId: z.uuid().nullish(),
  managerId: z.uuid().nullish(),
  status: z.enum(STATUS).optional(),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
});

export const GET = apiHandler(async (_req: Request, ctx: Ctx) => {
  const user = await requirePermission("employee:read");
  const { id } = await ctx.params;

  const employee = await prisma.employee.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      department: { select: { id: true, code: true, name: true } },
      location: { select: { id: true, code: true, name: true } },
      manager: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
    },
  });
  if (!employee) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ data: employee });
});

export const PUT = apiHandler(async (req: Request, ctx: Ctx) => {
  const user = await requirePermission("employee:update");
  const { id } = await ctx.params;
  const input = updateSchema.parse(await req.json());

  const existing = await prisma.employee.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (input.employeeCode) {
    const dup = await prisma.employee.findFirst({
      where: {
        organizationId: user.organizationId,
        employeeCode: input.employeeCode,
        deletedAt: null,
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) return NextResponse.json({ error: "employee_code_exists" }, { status: 409 });
  }
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
    if (input.managerId === id) {
      return NextResponse.json({ error: "invalid_manager" }, { status: 400 });
    }
    const m = await prisma.employee.findFirst({
      where: { id: input.managerId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!m) return NextResponse.json({ error: "invalid_manager" }, { status: 400 });
  }

  const row = await prisma.employee.update({
    where: { id },
    data: {
      ...(input.employeeCode !== undefined ? { employeeCode: input.employeeCode } : {}),
      ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
      ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
      ...(input.managerId !== undefined ? { managerId: input.managerId } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
    },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "EMPLOYEE",
    entityId: row.id,
    detail: { employeeCode: row.employeeCode, via: "api" },
  });
  return NextResponse.json({ data: row });
});

export const DELETE = apiHandler(async (_req: Request, ctx: Ctx) => {
  const user = await requirePermission("employee:delete");
  const { id } = await ctx.params;

  const existing = await prisma.employee.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, employeeCode: true },
  });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.employee.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, {
    action: "DELETE",
    entityType: "EMPLOYEE",
    entityId: id,
    detail: { employeeCode: existing.employeeCode, via: "api" },
  });
  return NextResponse.json({ ok: true });
});
