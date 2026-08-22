import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/**
 * Lightweight employee directory typeahead for the signature builder. Available
 * to any authenticated user in the org (it only returns the directory fields a
 * signature needs — name, position, department, office phone, email), excludes
 * resigned staff, and caps results so it stays a typeahead, not a data export.
 */
export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ data: [] });

  const where: Prisma.EmployeeWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    status: { not: "RESIGNED" },
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { employeeCode: { contains: q, mode: "insensitive" } },
      { position: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
    ],
  };

  const rows = await prisma.employee.findMany({
    where,
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      position: true,
      email: true,
      phone: true,
      departmentId: true,
      locationId: true,
      department: { select: { name: true } },
      location: { select: { name: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 8,
  });

  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id,
      employeeCode: r.employeeCode,
      fullName: `${r.firstName} ${r.lastName}`.trim(),
      position: r.position ?? "",
      department: r.department?.name ?? "",
      departmentId: r.departmentId ?? "",
      location: r.location?.name ?? "",
      locationId: r.locationId ?? "",
      officePhone: r.phone ?? "",
      email: r.email ?? "",
    })),
  });
});
