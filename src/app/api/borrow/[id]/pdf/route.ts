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

function fmt(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

interface FormData {
  refNo: string;
  createdAt: Date;
  requesterName: string;
  requesterCode: string;
  requesterPosition: string;
  departmentName: string;
  requesterPhone: string;
  requesterEmail: string;
  purpose: string;
  useLocation: string;
  borrowDate: Date | null;
  dueDate: Date | null;
  items: { name: string; assetTag: string; serialNumber: string; conditionBefore: string; conditionAfter: string }[];
}

function buildPdf(data: FormData, font: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 40;
    const doc = new PDFDocument({ size: "A4", margin, font: "" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("th", font);
    doc.font("th");

    const left = margin;
    const right = doc.page.width - margin;
    const width = right - left;

    // ---- Header band -------------------------------------------------
    const drawHeader = (subtitle: string) => {
      doc.rect(left, margin, 54, 30).lineWidth(1).stroke("#111827");
      doc.fontSize(14).fillColor("#111827").text("CHTNN", left, margin + 9, { width: 54, align: "center" });
      doc.fontSize(13).fillColor("#111827");
      doc.text("แบบฟอร์มการขอยืมใช้ทรัพย์สินด้านสารสนเทศ", left + 64, margin + 2, { width: width - 64 });
      doc.fontSize(9).fillColor("#374151");
      doc.text("Application form for borrowing information assets", left + 64, margin + 20, { width: width - 64 });
      doc.fontSize(8).fillColor("#6b7280");
      doc.text(subtitle, left + 64, margin + 32, { width: width - 64 });
      return margin + 52;
    };

    // ---- Small helpers ----------------------------------------------
    const line = (y: number) => doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor("#d1d5db").stroke();

    const sectionTitle = (y: number, text: string): number => {
      doc.rect(left, y, width, 18).fill("#eef2ff");
      doc.fillColor("#1e3a8a").fontSize(10).text(text, left + 6, y + 4, { width: width - 12 });
      return y + 24;
    };

    const field = (y: number, label: string, value: string, x: number, w: number): number => {
      doc.fillColor("#6b7280").fontSize(8).text(label, x, y, { width: w, lineBreak: false });
      doc.fillColor("#111827").fontSize(10).text(value || "-", x, y + 10, { width: w, lineBreak: false });
      return y + 28;
    };

    // Signature block: label + blank line + name/date placeholders.
    const signature = (y: number, x: number, w: number, roleTh: string, roleEn: string) => {
      const lineY = y + 34;
      doc.moveTo(x + 6, lineY).lineTo(x + w - 6, lineY).lineWidth(0.7).strokeColor("#111827").stroke();
      doc.fillColor("#374151").fontSize(8);
      doc.text(`ลงชื่อ / Signature`, x + 6, lineY + 3, { width: w - 12, align: "center", lineBreak: false });
      doc.fillColor("#111827").fontSize(9);
      doc.text(roleTh, x + 6, lineY + 16, { width: w - 12, align: "center", lineBreak: false });
      doc.fillColor("#6b7280").fontSize(8);
      doc.text(roleEn, x + 6, lineY + 27, { width: w - 12, align: "center", lineBreak: false });
      doc.fillColor("#6b7280").fontSize(8);
      doc.text("วันที่ / Date ______________", x + 6, lineY + 40, { width: w - 12, align: "center", lineBreak: false });
    };

    // Asset table. `phase` picks which condition column to show.
    const assetTable = (y: number, phase: "before" | "after"): number => {
      const cols = [
        { t: "ลำดับ / No.", w: 40 },
        { t: "ชื่อทรัพย์สิน / Asset name", w: width - 40 - 110 - 120 - 90 },
        { t: "รหัส / Code", w: 110 },
        { t: "Serial No.", w: 120 },
        { t: phase === "before" ? "สภาพก่อนยืม / Condition" : "สภาพเมื่อคืน / Condition", w: 90 },
      ];
      // header
      let x = left;
      doc.rect(left, y, width, 18).fill("#f3f4f6");
      doc.fillColor("#111827").fontSize(8.5);
      for (const c of cols) {
        doc.text(c.t, x + 3, y + 5, { width: c.w - 6, lineBreak: false });
        x += c.w;
      }
      doc.rect(left, y, width, 18).lineWidth(0.5).strokeColor("#9ca3af").stroke();
      let ry = y + 18;
      const rowH = 20;
      data.items.forEach((it, i) => {
        x = left;
        const cells = [
          String(i + 1),
          it.name,
          it.assetTag,
          it.serialNumber || "-",
          phase === "before" ? it.conditionBefore : it.conditionAfter,
        ];
        doc.fillColor("#111827").fontSize(9);
        cells.forEach((val, ci) => {
          doc.text(val, x + 3, ry + 5, { width: cols[ci].w - 6, lineBreak: false });
          x += cols[ci].w;
        });
        doc.rect(left, ry, width, rowH).lineWidth(0.4).strokeColor("#d1d5db").stroke();
        ry += rowH;
      });
      // vertical separators
      let vx = left;
      for (let i = 0; i < cols.length - 1; i++) {
        vx += cols[i].w;
        doc.moveTo(vx, y).lineTo(vx, ry).lineWidth(0.4).strokeColor("#d1d5db").stroke();
      }
      return ry + 8;
    };

    // ================= PAGE 1 =================
    let y = drawHeader("หน้า 1/2 — การขอยืมและการจ่าย / Page 1/2 — Request & Issue");
    // Ref + date row
    doc.fillColor("#111827").fontSize(10);
    doc.text(`เลขที่ / Ref No.: ${data.refNo}`, left, y, { width: width / 2, lineBreak: false });
    doc.text(`วันที่ / Date: ${fmt(data.createdAt)}`, left + width / 2, y, { width: width / 2, align: "right", lineBreak: false });
    y += 18;
    line(y); y += 8;

    // Section 1 — Requester
    y = sectionTitle(y, "ส่วนที่ 1: ข้อมูลผู้ขอยืม / Section 1: Requester Information");
    const half = width / 2;
    let yl = field(y, "1. ชื่อ-นามสกุล / Full name", data.requesterName, left, half - 8);
    field(y, "2. รหัสพนักงาน / Employee code", data.requesterCode, left + half, half - 8);
    y = yl;
    yl = field(y, "3. ตำแหน่ง / Position", data.requesterPosition, left, half - 8);
    field(y, "4. แผนก / Department", data.departmentName, left + half, half - 8);
    y = yl;
    yl = field(y, "5. โทรศัพท์ / Phone", data.requesterPhone, left, half - 8);
    field(y, "6. กำหนดคืน / Due date", fmt(data.dueDate), left + half, half - 8);
    y = yl;
    y = field(y, "7. วัตถุประสงค์ / Purpose", data.purpose || data.useLocation, left, width);
    y += 4;

    // Section 2 — Assets + issue
    y = sectionTitle(y, "ส่วนที่ 2: รายการทรัพย์สินที่ขอยืม / Section 2: Borrowed Assets");
    y = assetTable(y, "before");
    y += 6;

    // Signatures page 1 — 2 rows: requester/manager, then receiver/handover/IT mgr/mgmt
    const sigW2 = width / 2;
    signature(y, left, sigW2, "ผู้ร้องขอ", "Requester");
    signature(y, left + sigW2, sigW2, "ผู้จัดการแผนก", "Department Manager");
    y += 90;
    const sigW4 = width / 4;
    signature(y, left, sigW4, "ผู้รับมอบ", "Receiver");
    signature(y, left + sigW4, sigW4, "ผู้ส่งมอบ", "Issued by (IT)");
    signature(y, left + sigW4 * 2, sigW4, "ผู้ตรวจสอบ", "IT Manager");
    signature(y, left + sigW4 * 3, sigW4, "ผู้อนุมัติ", "Management");

    // ================= PAGE 2 =================
    doc.addPage();
    y = drawHeader("หน้า 2/2 — การรับคืน / Page 2/2 — Return");
    doc.fillColor("#111827").fontSize(10);
    doc.text(`เลขที่ / Ref No.: ${data.refNo}`, left, y, { width, lineBreak: false });
    y += 18;
    line(y); y += 8;

    y = sectionTitle(y, "ส่วนที่ 3: การรับคืนทรัพย์สิน / Section 3: Asset Return");
    y = assetTable(y, "after");
    y += 10;

    // Return-condition legend
    doc.fillColor("#6b7280").fontSize(8);
    doc.text("ผลการตรวจ / Inspection: COMPLETE, MISSING_ACCESSORY, REPAIR_REQUIRED, DAMAGED, LOST", left, y, { width });
    y += 24;

    signature(y, left, sigW4, "ผู้ส่งคืน", "Returned by");
    signature(y, left + sigW4, sigW4, "ผู้รับคืน", "Received by (IT)");
    signature(y, left + sigW4 * 2, sigW4, "ผู้ตรวจสอบ", "IT Manager");
    signature(y, left + sigW4 * 3, sigW4, "ผู้อนุมัติ", "Management");

    doc.end();
  });
}

export const GET = apiHandler(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission("borrow:read");
  const { id } = await ctx.params;

  const request = await prisma.borrowRequest.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      requester: { select: { firstName: true, lastName: true, employeeCode: true } },
      department: { select: { name: true } },
      items: {
        include: {
          asset: { select: { name: true, assetTag: true, serialNumber: true } },
          issueItems: { select: { conditionBefore: true }, take: 1, orderBy: { createdAt: "desc" } },
          returnItems: { select: { conditionAfter: true, inspectionResult: true }, take: 1, orderBy: { createdAt: "desc" } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!request) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const font = loadThaiFont();
  if (!font) return NextResponse.json({ error: "pdf_font_missing" }, { status: 501 });

  const data: FormData = {
    refNo: request.refNo,
    createdAt: request.createdAt,
    requesterName: request.requesterName ?? `${request.requester.firstName} ${request.requester.lastName}`,
    requesterCode: request.requester.employeeCode,
    requesterPosition: request.requesterPosition ?? "",
    departmentName: request.department?.name ?? "",
    requesterPhone: request.requesterPhone ?? "",
    requesterEmail: request.requesterEmail ?? "",
    purpose: request.purpose ?? "",
    useLocation: request.useLocation ?? "",
    borrowDate: request.borrowDate,
    dueDate: request.dueDate,
    items: request.items.map((i) => ({
      name: i.asset.name,
      assetTag: i.asset.assetTag,
      serialNumber: i.asset.serialNumber ?? "",
      conditionBefore: i.issueItems[0]?.conditionBefore ?? "",
      conditionAfter: i.returnItems[0]
        ? `${i.returnItems[0].conditionAfter}/${i.returnItems[0].inspectionResult}`
        : "",
    })),
  };

  const buffer = await buildPdf(data, font);
  await auditLog(user, { action: "EXPORT", entityType: "BORROW_REQUEST", entityId: id, detail: { refNo: request.refNo, format: "pdf" } });

  const url = new URL(req.url);
  const download = url.searchParams.get("download");
  const disposition = download ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${request.refNo}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
});
