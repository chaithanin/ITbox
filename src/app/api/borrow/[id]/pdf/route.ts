import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import PDFDocument from "pdfkit";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

function loadThaiFont(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "src/assets/fonts/NotoSansThai-Regular.ttf"));
  } catch {
    return null;
  }
}

/** Serif face for the Chaithanin (CHTNN) wordmark in the header. */
function loadSerifFont(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "src/assets/fonts/IBMPlexSerif-Regular.ttf"));
  } catch {
    return null;
  }
}

/** dd/mm/yyyy for the form's DD/MM/YYYY signature lines. */
function ddmmyyyy(d: Date | null | undefined): string {
  if (!d) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

interface Signer {
  name: string;
  date: string;
}
interface FormData {
  refNo: string;
  date: string;
  // requester
  nationalId: string;
  nameTh: string;
  nameEn: string;
  phone: string;
  email: string;
  department: string;
  note: string;
  periodFrom: string;
  periodTo: string;
  // asset lines (already formatted)
  borrowAssets: string[];
  returnAssets: string[];
  // signers (pre-filled where known)
  staff: Signer;
  manager: Signer;
  receiver: Signer;
  sender: Signer;
  itManager1: Signer;
  management1: Signer;
  returnee: Signer;
  recipient: Signer;
  itManager2: Signer;
  management2: Signer;
}

const EMPTY: Signer = { name: "", date: "" };

function buildPdf(d: FormData, font: Buffer, serif: Buffer | null): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 42;
    const doc = new PDFDocument({ size: "A4", margin, font: "" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("th", font);
    // Serif for the wordmark; fall back to the Thai face (still legible) if absent.
    const logoFont = serif ? "serif" : "th";
    if (serif) doc.registerFont("serif", serif);
    doc.font("th");

    const left = margin;
    const right = doc.page.width - margin;
    const width = right - left;

    // ---- dotted helper ------------------------------------------------
    const dots = (x1: number, x2: number, y: number) => {
      if (x2 <= x1) return;
      doc.save();
      doc.dash(1, { space: 1.6 }).lineWidth(0.6).strokeColor("#444");
      doc.moveTo(x1, y).lineTo(x2, y).stroke();
      doc.undash();
      doc.restore();
    };

    // A label followed by a dotted fill to `endX`, with an optional value
    // sitting just above the dots. Returns the next y.
    const fieldLine = (
      y: number, label: string, value: string, opts: { startX?: number; endX?: number; gap?: number } = {}
    ): number => {
      const startX = opts.startX ?? left;
      const endX = opts.endX ?? right;
      doc.fillColor("#111827").fontSize(9);
      doc.text(label, startX, y, { lineBreak: false });
      const lx = startX + doc.widthOfString(label) + 4;
      const baseline = y + 9;
      dots(lx, endX, baseline);
      if (value) {
        doc.fillColor("#1e3a8a").fontSize(9).text(value, lx + 2, y - 1, { width: endX - lx - 2, lineBreak: false });
      }
      return y + (opts.gap ?? 17);
    };

    const sectionTitle = (y: number, text: string): number => {
      doc.rect(left, y, width, 17).fill("#eef2ff");
      doc.fillColor("#1e3a8a").fontSize(10).text(text, left + 6, y + 4, { lineBreak: false });
      return y + 23;
    };

    // Signature block matching the company form:
    //   ลงชื่อ/Sign .....   ( name )   DD/MM/YYYY .....   role
    const sigBlock = (x: number, y: number, w: number, roleTh: string, roleEn: string, s: Signer) => {
      doc.fillColor("#111827").fontSize(8.5);
      const signLabel = "ลงชื่อ/Sign ";
      doc.text(signLabel, x, y, { lineBreak: false });
      dots(x + doc.widthOfString(signLabel), x + w, y + 9);

      // ( name )
      const ny = y + 15;
      doc.text("(", x + 6, ny, { lineBreak: false });
      dots(x + 12, x + w - 6, ny + 9);
      doc.text(")", x + w - 6, ny, { lineBreak: false });
      if (s.name) {
        doc.fillColor("#1e3a8a").text(s.name, x + 12, ny - 1, { width: w - 22, align: "center", lineBreak: false });
        doc.fillColor("#111827");
      }

      // DD/MM/YYYY .....
      const dy = ny + 15;
      const dLabel = "DD/MM/YYYY ";
      doc.text(dLabel, x + 6, dy, { lineBreak: false });
      dots(x + 6 + doc.widthOfString(dLabel), x + w - 6, dy + 9);
      if (s.date) {
        doc.fillColor("#1e3a8a").text(s.date, x + 6 + doc.widthOfString(dLabel) + 2, dy - 1, { lineBreak: false });
        doc.fillColor("#111827");
      }

      // role
      doc.fontSize(9).text(`${roleTh} / ${roleEn}`, x + 6, dy + 14, { width: w - 12, align: "center", lineBreak: false });
      return dy + 30;
    };

    // Numbered asset line (matches the 1..N blank list on the form).
    const assetLine = (y: number, n: number, value: string): number => {
      doc.fillColor("#111827").fontSize(9);
      const label = `      ${n}. `;
      doc.text(label, left, y, { lineBreak: false });
      const lx = left + doc.widthOfString(label);
      dots(lx, right, y + 9);
      if (value) {
        doc.fillColor("#1e3a8a").text(value, lx + 2, y - 1, { width: right - lx - 2, lineBreak: false });
      }
      return y + 18;
    };

    const assetList = (y: number, items: string[]): number => {
      const rows = Math.max(5, items.length);
      for (let i = 0; i < rows; i++) y = assetLine(y, i + 1, items[i] ?? "");
      return y;
    };

    // ================= PAGE 1 =================
    // Header: centered CHTNN wordmark logo, then centered title, then Ref No / Date.
    // The logo is drawn as vector type (CH + oversized T + NN) so it stays crisp
    // and needs no raster asset.
    doc.fillColor("#111827");
    const bigSize = 24;
    const smallSize = 17;
    const kern = 3;
    doc.font(logoFont);
    const wCH = doc.fontSize(smallSize).widthOfString("CH");
    const wNN = doc.fontSize(smallSize).widthOfString("NN");
    const wT = doc.fontSize(bigSize).widthOfString("T");
    const groupW = wCH + kern + wT + kern + wNN;
    let gx = left + (width - groupW) / 2;
    const yBig = margin;
    const ySmall = margin + (bigSize - smallSize) * 0.62; // baseline-align the smaller caps
    doc.fontSize(smallSize).text("CH", gx, ySmall, { lineBreak: false });
    gx += wCH + kern;
    doc.fontSize(bigSize).text("T", gx, yBig, { lineBreak: false });
    gx += wT + kern;
    doc.fontSize(smallSize).text("NN", gx, ySmall, { lineBreak: false });
    doc.fontSize(11).text("Chaithanin", left, margin + bigSize + 1, { width, align: "center", lineBreak: false });

    // Title (back to the Thai face)
    doc.font("th");
    const titleY = margin + 42;
    doc.fontSize(12).fillColor("#111827").text("แบบฟอร์มการขอยืมใช้ทรัพย์สินด้านสารสนเทศ", left, titleY, { width, align: "center", lineBreak: false });
    doc.fontSize(9).fillColor("#374151").text("Application form for borrowing information assets", left, titleY + 16, { width, align: "center", lineBreak: false });

    let y = titleY + 32;
    doc.fillColor("#111827").fontSize(9);
    doc.text(`Ref No : ${d.refNo}`, left, y, { lineBreak: false });
    doc.text(`Date : ${d.date}`, left, y, { width, align: "center", lineBreak: false });
    y += 18;

    // Section 1 — Requester
    y = sectionTitle(y, "1. รายละเอียดผู้ร้องขอ / Requester");
    y = fieldLine(y, "1. หมายเลขบัตรประจำตัวประชาชน/Passport", d.nationalId);
    y = fieldLine(y, "2. ชื่อ-สกุลภาษาไทย (นาย/นาง/นางสาว)", d.nameTh);
    y = fieldLine(y, "3. ชื่อ-สกุลภาษาอังกฤษ (Mr./Mrs./Ms.)", d.nameEn);
    // 4. phone + email on one line
    {
      doc.fillColor("#111827").fontSize(9);
      const l1 = "4. เบอร์โทรศัพท์ / Phone No ";
      doc.text(l1, left, y, { lineBreak: false });
      const midX = left + width * 0.52;
      const p1 = left + doc.widthOfString(l1);
      dots(p1, midX - 4, y + 9);
      if (d.phone) doc.fillColor("#1e3a8a").text(d.phone, p1 + 2, y - 1, { width: midX - p1 - 6, lineBreak: false });
      doc.fillColor("#111827").text(" และอีเมล / Email ", midX, y, { lineBreak: false });
      const p2 = midX + doc.widthOfString(" และอีเมล / Email ");
      dots(p2, right, y + 9);
      if (d.email) doc.fillColor("#1e3a8a").text(d.email, p2 + 2, y - 1, { width: right - p2 - 2, lineBreak: false });
      y += 17;
    }
    y = fieldLine(y, "5. แผนก / Department", d.department);
    y = fieldLine(y, "6. หมายเหตุ (Note)", d.note);
    // 7. period from / to
    {
      doc.fillColor("#111827").fontSize(9);
      const l1 = "7. ระยะเวลาที่ขอใช้งาน  ตั้งแต่ ";
      doc.text(l1, left, y, { lineBreak: false });
      const x1 = left + doc.widthOfString(l1);
      const midX = left + width * 0.55;
      dots(x1, midX - 4, y + 9);
      if (d.periodFrom) doc.fillColor("#1e3a8a").text(d.periodFrom, x1 + 2, y - 1, { lineBreak: false });
      doc.fillColor("#111827").text(" ถึง / to ", midX, y, { lineBreak: false });
      const x2 = midX + doc.widthOfString(" ถึง / to ");
      dots(x2, right, y + 9);
      if (d.periodTo) doc.fillColor("#1e3a8a").text(d.periodTo, x2 + 2, y - 1, { lineBreak: false });
      y += 20;
    }

    // Staff + Manager signatures (side by side)
    const halfW = (width - 16) / 2;
    sigBlock(left, y, halfW, "ผู้ร้องขอ", "Staff", d.staff);
    sigBlock(left + halfW + 16, y, halfW, "ผู้จัดการแผนก", "Manager", d.manager);
    y += 62;

    // Section 2 — Assets requested
    y = sectionTitle(y, "2. สินทรัพย์ที่ขอใช้ / Assets requested");
    y = assetList(y, d.borrowAssets);
    y += 6;

    // Receiver / Sender / IT Manager / Management (4 across)
    const qW = (width - 3 * 10) / 4;
    sigBlock(left, y, qW, "ผู้รับมอบ", "Receiver", d.receiver);
    sigBlock(left + (qW + 10), y, qW, "ผู้ส่งมอบ", "Sender", d.sender);
    sigBlock(left + 2 * (qW + 10), y, qW, "ผู้ตรวจสอบ", "IT Manager", d.itManager1);
    sigBlock(left + 3 * (qW + 10), y, qW, "ผู้ตรวจสอบ", "Management", d.management1);

    doc.fontSize(9).fillColor("#6b7280").text("Page 1 of 2", left, doc.page.height - margin - 30, { width, align: "center", lineBreak: false });

    // ================= PAGE 2 =================
    doc.addPage();
    doc.fillColor("#111827").fontSize(9).text(`Ref No : ${d.refNo}`, left, margin, { lineBreak: false });
    doc.text(`Date : ${d.date}`, left, margin, { width, align: "center", lineBreak: false });
    y = margin + 20;

    y = sectionTitle(y, "3. รับคืนสินทรัพย์ / Return Assets");
    y = assetList(y, d.returnAssets);
    y += 10;

    sigBlock(left, y, qW, "ผู้ส่งคืน", "Returnee", d.returnee);
    sigBlock(left + (qW + 10), y, qW, "ผู้รับคืน", "Recipient", d.recipient);
    sigBlock(left + 2 * (qW + 10), y, qW, "ผู้ตรวจสอบ", "IT Manager", d.itManager2);
    sigBlock(left + 3 * (qW + 10), y, qW, "ผู้ตรวจสอบ", "Management", d.management2);

    doc.fontSize(9).fillColor("#6b7280").text("Page 2 of 2", left, doc.page.height - margin - 30, { width, align: "center", lineBreak: false });

    doc.end();
  });
}

export const GET = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission("borrow:read");
  const { id } = await ctx.params;

  const r = await prisma.borrowRequest.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      requester: { select: { firstName: true, lastName: true, employeeCode: true } },
      department: { select: { name: true } },
      items: {
        include: {
          asset: { select: { name: true, assetTag: true, serialNumber: true } },
          returnItems: { select: { conditionAfter: true, inspectionResult: true }, take: 1, orderBy: { createdAt: "desc" } },
        },
        orderBy: { createdAt: "asc" },
      },
      approvals: { orderBy: { sequence: "asc" } },
      issues: { orderBy: { createdAt: "desc" }, take: 1 },
      returns: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const font = loadThaiFont();
  if (!font) return NextResponse.json({ error: "pdf_font_missing" }, { status: 501 });
  const serif = loadSerifFont();

  const approvalOf = (step: string) => r.approvals.find((a) => a.step === step);
  const mgr = approvalOf("MANAGER");
  const itA = approvalOf("IT");
  const mgmt = approvalOf("MANAGEMENT");
  const issue = r.issues[0];
  const ret = r.returns[0];
  const requesterName = r.requesterName ?? `${r.requester.firstName} ${r.requester.lastName}`.trim();

  const sig = (name: string | null | undefined, date: Date | null | undefined): Signer =>
    ({ name: name ?? "", date: ddmmyyyy(date) });

  const data: FormData = {
    refNo: r.refNo,
    date: ddmmyyyy(r.createdAt),
    nationalId: "",
    nameTh: requesterName,
    nameEn: "",
    phone: r.requesterPhone ?? "",
    email: r.requesterEmail ?? "",
    department: r.department?.name ?? "",
    note: r.purpose ?? r.notes ?? "",
    periodFrom: ddmmyyyy(r.borrowDate),
    periodTo: ddmmyyyy(r.dueDate),
    borrowAssets: r.items.map((i) =>
      [i.asset.name, i.asset.assetTag, i.asset.serialNumber ? `S/N ${i.asset.serialNumber}` : ""]
        .filter(Boolean).join("  ·  ")
    ),
    returnAssets: r.items.map((i) => {
      const cond = i.returnItems[0] ? `  [${i.returnItems[0].conditionAfter}/${i.returnItems[0].inspectionResult}]` : "";
      return [i.asset.name, i.asset.assetTag, i.asset.serialNumber ? `S/N ${i.asset.serialNumber}` : ""]
        .filter(Boolean).join("  ·  ") + cond;
    }),
    staff: sig(requesterName, r.submittedAt ?? r.createdAt),
    manager: sig(mgr?.approverName, mgr?.decidedAt),
    receiver: sig(issue?.receivedByName, issue?.issuedAt),
    sender: sig(issue?.issuedByName, issue?.issuedAt),
    itManager1: sig(itA?.approverName, itA?.decidedAt),
    management1: sig(mgmt?.approverName, mgmt?.decidedAt),
    returnee: sig(ret?.returnedByName, ret?.returnedAt),
    recipient: sig(ret?.receivedByName, ret?.returnedAt),
    itManager2: EMPTY,
    management2: EMPTY,
  };

  const buffer = await buildPdf(data, font, serif);
  await auditLog(user, { action: "EXPORT", entityType: "BORROW_REQUEST", entityId: id, detail: { refNo: r.refNo, format: "pdf" } });

  const url = new URL(req.url);
  const download = url.searchParams.get("download");
  const disposition = download ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${r.refNo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
