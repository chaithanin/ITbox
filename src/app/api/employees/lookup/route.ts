/**
 * Authenticated staff-ID → employee lookup for the admin "Create User" form.
 *
 * Unlike the public /api/public/employee-lookup (masked, rate-limited, no
 * session), this is admin-only (user:manage) and org-scoped, so it may return
 * the employee's full name and department to pre-fill the new-account form.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

const schema = z.object({ code: z.string().trim().min(1).max(50) });

export const GET = apiHandler(async (req: Request) => {
  const admin = await requirePermission("user:manage");
  const url = new URL(req.url);
  const parsed = schema.safeParse({ code: url.searchParams.get("code") ?? "" });
  if (!parsed.success) return NextResponse.json({ found: false });

  const emp = await prisma.employee.findFirst({
    where: {
      organizationId: admin.organizationId,
      deletedAt: null,
      employeeCode: { equals: parsed.data.code, mode: "insensitive" },
    },
    select: {
      firstName: true,
      lastName: true,
      employeeCode: true,
      userId: true,
      department: { select: { name: true } },
    },
  });

  if (!emp) return NextResponse.json({ found: false });

  return NextResponse.json({
    found: true,
    name: `${emp.firstName} ${emp.lastName}`.trim(),
    department: emp.department?.name ?? null,
    // Flag when this employee is already tied to a login account.
    linked: emp.userId != null,
  });
});
