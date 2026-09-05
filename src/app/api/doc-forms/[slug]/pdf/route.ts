import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { getForm } from "@/lib/documents/forms";
import { buildDocumentPdf, buildAccessRequestPdf, type ValueSource, type AccessPdfItem } from "@/lib/documents/pdf";

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

  // Access-request: when the RBAC builder posts an itemsJson payload, render the
  // enhanced PDF (employee info + Default/Additional/Restricted groups).
  const itemsRaw = values.get("itemsJson");
  let pdf: Buffer;
  if (slug === "access-request" && itemsRaw) {
    let items: AccessPdfItem[] = [];
    try {
      const parsed = JSON.parse(itemsRaw) as AccessPdfItem[];
      if (Array.isArray(parsed)) items = parsed;
    } catch { /* fall through with empty items */ }
    const chainRaw = values.get("approvalChain");
    pdf = await buildAccessRequestPdf({
      refNo: values.get("refNo"), employeeCode: values.get("employeeCode"),
      nameTh: values.get("nameTh"), nameEn: values.get("nameEn"),
      phone: values.get("phone"), email: values.get("email"),
      company: values.get("company"), department: values.get("department2") || values.get("department"),
      position: values.get("position"), jobLevel: values.get("jobLevel"),
      effectiveDate: values.get("effectiveDate"), expiryDate: values.get("expiryDate"),
      businessJustification: values.get("businessJustification"),
      approvalChain: chainRaw ? chainRaw.split("|").filter(Boolean) : [],
      items,
    });
  } else {
    pdf = await buildDocumentPdf(form, values);
  }
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
