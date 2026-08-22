import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/**
 * Assets currently held (CHECKED_OUT) by one employee, for the new-case form's
 * dynamic device picker. Authenticated + org-scoped; returns only id/tag/name.
 */
export const GET = apiHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;

  const employee = await prisma.employee.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!employee) return NextResponse.json({ data: [] });

  const assignments = await prisma.assetAssignment.findMany({
    where: {
      organizationId: user.organizationId,
      employeeId: id,
      status: "CHECKED_OUT",
    },
    include: { asset: { select: { id: true, assetTag: true, name: true } } },
    orderBy: { assignedAt: "desc" },
  });

  return NextResponse.json({
    data: assignments
      .filter((a) => a.asset !== null)
      .map((a) => ({ id: a.asset!.id, assetTag: a.asset!.assetTag, name: a.asset!.name })),
  });
});
