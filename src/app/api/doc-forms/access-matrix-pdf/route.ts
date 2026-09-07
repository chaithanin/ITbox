import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { decodeMatrix } from "@/lib/documents/access-matrix-decode";
import { buildAccessMatrixPdf } from "@/lib/documents/pdf";
import { generateAccessRefNo } from "@/lib/documents/access-ref";

export const dynamic = "force-dynamic";

/**
 * POST /api/doc-forms/access-matrix-pdf
 * Renders the ERP access-request form (4.A) as a PDF showing ONLY the selected
 * menus/permissions. The matrix form posts its fields here (target=_blank).
 */
export const POST = apiHandler(async (req: Request) => {
  const user = await requireUser();
  const fd = await req.formData();
  const decoded = decodeMatrix(fd);
  // Auto-assign the daily-sequenced Ref No (REQ{DDMMYY}-{NN}) when left blank.
  if (!decoded.requester.refNo) {
    decoded.requester.refNo = await generateAccessRefNo(user.organizationId);
  }
  const pdf = await buildAccessMatrixPdf(decoded);
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="access-request.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
