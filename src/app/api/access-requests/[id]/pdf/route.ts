import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildAccessRequestPdf, type AccessPdfItem } from "@/lib/documents/pdf";

export const dynamic = "force-dynamic";

const ddmmyyyy = (d: Date | null | undefined): string | null =>
  d ? `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}` : null;

/**
 * GET /api/access-requests/[id]/pdf
 * Renders a SAVED access request as the 4.A document with the captured approval
 * sign-offs (Dept Manager / IT Support / IT Manager / Management) filled in.
 */
export const GET = apiHandler(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission("accessreq:read");
  const { id } = await ctx.params;
  const r = await prisma.accessRequest.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: { items: { orderBy: { source: "asc" } } },
  });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const items: AccessPdfItem[] = r.items.map((it) => ({
    systemLabel: it.system,
    permissionLevel: it.permissionLevel,
    resource: it.resource,
    source: it.source as AccessPdfItem["source"],
  }));

  const pdf = await buildAccessRequestPdf({
    refNo: r.refNo ?? undefined,
    employeeCode: r.employeeCode ?? undefined,
    nameTh: r.nameTh ?? undefined,
    nameEn: r.nameEn ?? undefined,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    company: r.company ?? undefined,
    department: r.department ?? undefined,
    position: r.position ?? undefined,
    jobLevel: r.jobLevel ?? undefined,
    effectiveDate: ddmmyyyy(r.effectiveDate) ?? undefined,
    expiryDate: ddmmyyyy(r.expiryDate) ?? undefined,
    businessJustification: r.businessJustification ?? undefined,
    items,
    approvals: {
      manager: { name: r.managerApprovedBy, date: ddmmyyyy(r.managerApprovedAt) },
      itSupport: { name: r.itSupportBy, date: ddmmyyyy(r.itSupportAt) },
      itManager: { name: r.itManagerBy, date: ddmmyyyy(r.itManagerAt) },
      management: { name: r.managementBy, date: ddmmyyyy(r.managementAt) },
    },
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="access-request-${r.refNo || id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
