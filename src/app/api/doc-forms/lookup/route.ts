/**
 * Staff-ID → employee lookup for the IT document fill-in forms.
 *
 * Any signed-in user may look up a staff code to pre-fill a request form with
 * their own details (name, department, position, phone, email). It is
 * org-scoped and returns only directory-level fields.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const schema = z.object({ code: z.string().trim().min(1).max(50) });

export const GET = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const parsed = schema.safeParse({ code: url.searchParams.get("code") ?? "" });
  if (!parsed.success) return NextResponse.json({ found: false });

  const emp = await prisma.employee.findFirst({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      employeeCode: { equals: parsed.data.code, mode: "insensitive" },
    },
    select: {
      firstName: true,
      lastName: true,
      position: true,
      phone: true,
      email: true,
      department: { select: { name: true } },
    },
  });

  if (!emp) return NextResponse.json({ found: false });

  return NextResponse.json({
    found: true,
    name: `${emp.firstName} ${emp.lastName}`.trim(),
    department: emp.department?.name ?? null,
    position: emp.position ?? null,
    phone: emp.phone ?? null,
    email: emp.email ?? null,
  });
});
