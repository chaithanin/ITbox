import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildDriveMappingPdf, type DriveMappingPdfData } from "@/lib/documents/pdf";

export const dynamic = "force-dynamic";

const ddmmyyyy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** GET /api/drive-mappings/[id]/pdf — handover sheet (no password printed). */
export const GET = apiHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission("support:read");
  const { id } = await ctx.params;
  const r = await prisma.driveMapping.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const data: DriveMappingPdfData = {
    date: ddmmyyyy(r.createdAt),
    employeeName: r.employeeName ?? undefined,
    employeeCode: r.employeeCode ?? undefined,
    nickname: r.nickname ?? undefined,
    position: r.position ?? undefined,
    computerName: r.computerName ?? undefined,
    userShare: r.userShare ?? undefined,
    loginUsername: r.loginUsername ?? undefined,
    drives: r.drives,
    notes: r.notes ?? undefined,
  };
  const pdf = await buildDriveMappingPdf(data);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="drive-setup-${r.employeeCode || id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
