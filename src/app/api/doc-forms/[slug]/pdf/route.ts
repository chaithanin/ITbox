import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getForm } from "@/lib/documents/forms";
import { buildDocumentPdf, type ValueSource } from "@/lib/documents/pdf";

export const dynamic = "force-dynamic";

/**
 * POST /api/documents/[slug]/pdf
 * Renders a filled A4 PDF of the IT document template from the submitted fields.
 * The fill page posts here (target=_blank) so the PDF opens in a new tab.
 */
export const POST = apiHandler(async (req: Request, ctx: { params: Promise<{ slug: string }> }) => {
  await requireUser();
  const { slug } = await ctx.params;
  const form = getForm(slug);
  if (!form || form.referenceOnly) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const fd = await req.formData();
  const values: ValueSource = {
    get: (name) => {
      const v = fd.get(name);
      return typeof v === "string" ? v : "";
    },
    getAll: (name) => fd.getAll(name).filter((v): v is string => typeof v === "string"),
  };

  const pdf = await buildDocumentPdf(form, values);
  const filename = `${slug}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
