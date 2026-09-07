import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { FormDef, OptionGroup, Section, SignatureRole, TableSpec } from "./forms";
import { SIGNATURE_LABEL } from "./forms";
import type { DecodedMatrix } from "./access-matrix-decode";

function loadThaiFont(): Buffer | null {
  try { return fs.readFileSync(path.join(process.cwd(), "src/assets/fonts/NotoSansThai-Regular.ttf")); }
  catch { return null; }
}
function loadSerifFont(): Buffer | null {
  try { return fs.readFileSync(path.join(process.cwd(), "src/assets/fonts/IBMPlexSerif-Regular.ttf")); }
  catch { return null; }
}

/** Reads submitted values by field name (mirrors FormData). */
export interface ValueSource {
  get(name: string): string;
  getAll(name: string): string[];
}

/** Formats a date as DD/MM/YYYY. Accepts a YYYY-MM-DD string, any Date-parsable
 *  string, or nothing (→ today). Returns "" if the input cannot be parsed. */
function fmtDate(input?: string): string {
  let d: Date;
  if (!input || !input.trim()) {
    d = new Date();
  } else {
    const iso = input.trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    d = new Date(iso);
    if (isNaN(d.getTime())) return "";
  }
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export function buildDocumentPdf(form: FormDef, v: ValueSource): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const thai = loadThaiFont();
    const serif = loadSerifFont();
    const margin = 40;
    const doc = new PDFDocument({ size: "A4", margin, font: "" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    if (thai) doc.registerFont("th", thai);
    const logoFont = serif ? "serif" : thai ? "th" : "Helvetica";
    if (serif) doc.registerFont("serif", serif);
    const body = thai ? "th" : "Helvetica";
    doc.font(body);

    const left = margin;
    const width = doc.page.width - margin * 2;
    const bottom = doc.page.height - margin;
    let y = margin;
    const ensure = (h: number) => { if (y + h > bottom) { doc.addPage(); y = margin; } };

    // ---- header ------------------------------------------------------------
    doc.fillColor("#111827");
    const bigSize = 22, smallSize = 15, kern = 3;
    doc.font(logoFont);
    const wCH = doc.fontSize(smallSize).widthOfString("CH");
    const wT = doc.fontSize(bigSize).widthOfString("T");
    const wNN = doc.fontSize(smallSize).widthOfString("NN");
    let gx = left + (width - (wCH + kern + wT + kern + wNN)) / 2;
    doc.fontSize(smallSize).text("CH", gx, margin + (bigSize - smallSize) * 0.62, { lineBreak: false });
    gx += wCH + kern;
    doc.fontSize(bigSize).text("T", gx, margin, { lineBreak: false });
    gx += wT + kern;
    doc.fontSize(smallSize).text("NN", gx, margin + (bigSize - smallSize) * 0.62, { lineBreak: false });
    doc.font(logoFont).fontSize(10).text("Chaithanin Co.,Ltd.", left, margin + bigSize + 1, { width, align: "center", lineBreak: false });
    doc.font(body).fontSize(8).fillColor("#374151")
      .text(`Ref No : ${v.get("refNo") || "________"}`, left, margin + 2, { width, align: "right", lineBreak: false });

    doc.font(body).fillColor("#111827");
    y = margin + 40;
    doc.fontSize(13).text(form.titleTh, left, y, { width, align: "center" });
    y = doc.y + 1;
    doc.fontSize(9).fillColor("#4b5563").text(form.titleEn, left, y, { width, align: "center" });
    y = doc.y + 8;
    doc.fillColor("#111827");

    // ---- primitives --------------------------------------------------------
    const checkbox = (x: number, cy: number, checked: boolean) => {
      doc.lineWidth(0.8).rect(x, cy, 8, 8).stroke("#374151");
      if (checked) { doc.lineWidth(1).moveTo(x + 1.5, cy + 4).lineTo(x + 3.2, cy + 6.5).lineTo(x + 6.8, cy + 1.5).stroke("#111827"); doc.lineWidth(0.8); }
      doc.fillColor("#111827");
    };

    const drawGroup = (g: OptionGroup) => {
      const selected = new Set(v.getAll(g.name));
      const levelSel = new Set(v.getAll(`${g.name}__level`));
      const modSel = new Set(v.getAll(`${g.name}__mod`));
      ensure(14);
      // label + inline permission levels
      if (g.th) {
        doc.font(body).fontSize(8.5).fillColor("#1f2937").text(g.th, left, y, { lineBreak: false });
      }
      if (g.levels && g.levels.length) {
        let lx = left + (g.th ? doc.widthOfString(g.th) + 10 : 0);
        for (const lv of g.levels) {
          if (lx + 12 + doc.fontSize(8).widthOfString(lv.th) > left + width) { y += 12; lx = left + 10; }
          checkbox(lx, y, levelSel.has(lv.value));
          doc.font(body).fontSize(8).fillColor("#111827").text(lv.th, lx + 11, y - 1, { lineBreak: false });
          lx += 11 + doc.widthOfString(lv.th) + 10;
        }
      }
      y += g.th || g.levels ? 12 : 0;

      // options
      const colW = g.inline ? 0 : width / 3;
      if (g.inline) {
        let lx = left;
        for (const opt of g.options) {
          const w = 11 + doc.fontSize(8).widthOfString(opt.th) + 10;
          if (lx + w > left + width) { y += 13; lx = left; ensure(13); }
          checkbox(lx, y, selected.has(opt.value));
          doc.font(body).fontSize(8).fillColor("#111827").text(opt.th, lx + 11, y - 1, { lineBreak: false });
          lx += w;
        }
        y += 13;
      } else {
        let i = 0;
        for (const opt of g.options) {
          const col = i % 3;
          if (col === 0) ensure(13);
          const x = left + col * colW;
          checkbox(x, y, selected.has(opt.value));
          doc.font(body).fontSize(8).fillColor("#111827").text(opt.th, x + 11, y - 1, { width: colW - 13, lineBreak: false, ellipsis: true });
          i++;
          if (col === 2) y += 13;
        }
        if (i % 3 !== 0) y += 13;
      }

      // module matrix (e.g. Mango ERP codes)
      if (g.matrix && g.matrix.length) {
        ensure(13);
        let lx = left;
        for (const code of g.matrix) {
          const w = 10 + doc.fontSize(7).widthOfString(code) + 7;
          if (lx + w > left + width) { y += 12; lx = left; ensure(12); }
          checkbox(lx, y, modSel.has(code));
          doc.font(body).fontSize(7).fillColor("#374151").text(code, lx + 10, y, { lineBreak: false });
          lx += w;
        }
        y += 13;
      }

      if (g.other) {
        ensure(13);
        const otherVal = v.get(`${g.name}__other`);
        checkbox(left, y, !!otherVal);
        doc.font(body).fontSize(8).fillColor("#111827").text(`อื่น ๆ / Other: ${otherVal || ""}`, left + 11, y - 1, { width: width - 13, lineBreak: false });
        y += 14;
      }
      y += 3;
    };

    const drawTable = (t: TableSpec) => {
      const totalW = t.columns.reduce((s, c) => s + c.width, 0);
      const colX: number[] = []; let cx = left;
      for (const c of t.columns) { colX.push(cx); cx += (c.width / totalW) * width; }
      colX.push(left + width);
      const rowH = 16;
      ensure(rowH + 4);
      doc.rect(left, y, width, rowH).fill("#e5edff");
      doc.fillColor("#1e3a8a").font(body).fontSize(7.5);
      t.columns.forEach((c, i) => doc.text(c.th, colX[i] + 3, y + 4, { width: colX[i + 1] - colX[i] - 6, lineBreak: false, ellipsis: true }));
      for (let r = 0; r < t.rows; r++) {
        ensure(rowH);
        doc.lineWidth(0.5).rect(left, y, width, rowH).stroke("#cbd5e1");
        for (let i = 1; i < colX.length - 1; i++) doc.moveTo(colX[i], y).lineTo(colX[i], y + rowH).stroke("#cbd5e1");
        doc.fillColor("#111827").font(body).fontSize(8);
        t.columns.forEach((c, i) => {
          const val = v.get(`${t.name}.${r}.${c.key}`);
          if (val) doc.text(val, colX[i] + 3, y + 4, { width: colX[i + 1] - colX[i] - 6, lineBreak: false, ellipsis: true });
        });
        y += rowH;
      }
      y += 6;
    };

    const drawSection = (s: Section) => {
      if (s.title) {
        ensure(18);
        doc.rect(left, y, width, 15).fill("#e5edff");
        doc.fillColor("#1e3a8a").font(body).fontSize(9).text(s.title, left + 5, y + 3, { width: width - 10, lineBreak: false });
        y += 20; doc.fillColor("#111827");
      }
      if (s.fields) {
        for (let i = 0; i < s.fields.length; i++) {
          const f = s.fields[i];
          if (f.type === "textarea") {
            ensure(26);
            doc.font(body).fontSize(8.5).fillColor("#111827").text(`${f.th}:`, left, y, { lineBreak: false });
            y += 12;
            doc.fillColor("#1d4ed8").fontSize(8.5).text(v.get(f.name) || "—", left + 6, y, { width: width - 6 });
            y = doc.y + 6; doc.fillColor("#111827");
          } else if (f.half && i + 1 < s.fields.length && s.fields[i + 1].half) {
            ensure(16);
            doc.font(body).fontSize(8.5).fillColor("#111827").text(`${f.th}: `, left, y, { continued: true, lineBreak: false });
            doc.fillColor("#1d4ed8").text(v.get(f.name) || "—", { lineBreak: false });
            const f2 = s.fields[i + 1];
            doc.fillColor("#111827").text(`${f2.th}: `, left + width / 2, y, { continued: true, lineBreak: false });
            doc.fillColor("#1d4ed8").text(v.get(f2.name) || "—", { lineBreak: false });
            doc.fillColor("#111827");
            y += 15; i++;
          } else {
            ensure(15);
            doc.font(body).fontSize(8.5).fillColor("#111827").text(`${f.th}: `, left, y, { continued: true, lineBreak: false });
            doc.fillColor("#1d4ed8").text(v.get(f.name) || "—", { lineBreak: false });
            doc.fillColor("#111827");
            y += 15;
          }
        }
      }
      if (s.groups) for (const g of s.groups) drawGroup(g);
      if (s.tables) for (const t of s.tables) drawTable(t);
      if (s.note) {
        ensure(24);
        doc.font(body).fontSize(7.5).fillColor("#6b7280").text(s.note, left, y, { width });
        y = doc.y + 6; doc.fillColor("#111827");
      }
    };

    const drawSignatures = (roles: SignatureRole[]) => {
      if (!roles.length) return;
      y += 6;
      const blockW = width / 2, blockH = 46;
      for (let i = 0; i < roles.length; i += 2) {
        ensure(blockH);
        for (let j = 0; j < 2 && i + j < roles.length; j++) {
          const role = roles[i + j];
          const bx = left + j * blockW;
          const isRequester = role === "requester";
          const name = isRequester ? (v.get("nameTh") || v.get("nameEn") || "").trim() : "";
          const dateStr = isRequester ? fmtDate() : "";
          doc.font(body).fontSize(8).fillColor("#111827");
          doc.text("ลงชื่อ/Sign ............................................", bx, y + 4, { width: blockW, align: "center", lineBreak: false });
          if (name) {
            doc.text(`( ${name} )`, bx, y + 18, { width: blockW, align: "center", lineBreak: false });
          } else {
            doc.text("(........................................................)", bx, y + 18, { width: blockW, align: "center", lineBreak: false });
          }
          doc.fontSize(7.5).fillColor("#6b7280").text(`วันที่ / DD/MM/YYYY ${dateStr || "..................."}`, bx, y + 30, { width: blockW, align: "center", lineBreak: false });
          doc.fontSize(8).fillColor("#111827").text(SIGNATURE_LABEL[role], bx, y + 40, { width: blockW, align: "center", lineBreak: false });
        }
        y += blockH + 6;
      }
    };

    // (access-request enhanced PDF is produced by buildAccessRequestPdf below)
    // ---- render ------------------------------------------------------------
    if (form.topGroups) for (const g of form.topGroups) drawGroup(g);
    for (const s of form.sections) drawSection(s);
    drawSignatures(form.requesterSignatures ?? []);
    if (form.adminSection) drawSection(form.adminSection);
    drawSignatures(form.adminSignatures ?? []);

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Enhanced Access Request PDF (RBAC): employee info + permissions grouped by
// source (Default / Additional / Restricted) + justification + approval chain.
// ---------------------------------------------------------------------------
export interface AccessPdfItem { systemLabel: string; permissionLevel: string; resource?: string | null; source: "DEFAULT" | "ADDITIONAL" | "RESTRICTED" }
export interface AccessPdfData {
  refNo?: string; employeeCode?: string; nameTh?: string; nameEn?: string; phone?: string; email?: string;
  company?: string; department?: string; position?: string; jobLevel?: string;
  effectiveDate?: string; expiryDate?: string; businessJustification?: string;
  approvalChain?: string[]; items: AccessPdfItem[];
}

export function buildAccessRequestPdf(d: AccessPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const thai = loadThaiFont();
    const serif = loadSerifFont();
    const margin = 40;
    const doc = new PDFDocument({ size: "A4", margin, font: "" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    if (thai) doc.registerFont("th", thai);
    const logoFont = serif ? "serif" : thai ? "th" : "Helvetica";
    if (serif) doc.registerFont("serif", serif);
    const body = thai ? "th" : "Helvetica";
    const left = margin, width = doc.page.width - margin * 2, bottom = doc.page.height - margin;
    let y = margin;
    const ensure = (h: number) => { if (y + h > bottom) { doc.addPage(); y = margin; } };

    // header
    doc.font(logoFont).fillColor("#111827");
    const big = 22, sm = 15, kern = 3;
    const wCH = doc.fontSize(sm).widthOfString("CH"), wT = doc.fontSize(big).widthOfString("T"), wNN = doc.fontSize(sm).widthOfString("NN");
    let gx = left + (width - (wCH + kern + wT + kern + wNN)) / 2;
    doc.fontSize(sm).text("CH", gx, margin + (big - sm) * 0.62, { lineBreak: false }); gx += wCH + kern;
    doc.fontSize(big).text("T", gx, margin, { lineBreak: false }); gx += wT + kern;
    doc.fontSize(sm).text("NN", gx, margin + (big - sm) * 0.62, { lineBreak: false });
    doc.font(logoFont).fontSize(10).text("Chaithanin Co.,Ltd.", left, margin + big + 1, { width, align: "center", lineBreak: false });
    doc.font(body).fontSize(8).fillColor("#374151").text(`Ref No : ${d.refNo || "________"}`, left, margin + 2, { width, align: "right", lineBreak: false });
    y = margin + 40;
    doc.font(body).fillColor("#111827").fontSize(13).text("แบบฟอร์มขอสิทธิ์การใช้งานระบบสารสนเทศ", left, y, { width, align: "center" });
    y = doc.y + 1;
    doc.fontSize(9).fillColor("#4b5563").text("Information System Access Request (RBAC)", left, y, { width, align: "center" });
    y = doc.y + 8; doc.fillColor("#111827");

    const bar = (t: string) => { ensure(18); doc.rect(left, y, width, 15).fill("#e5edff"); doc.fillColor("#1e3a8a").font(body).fontSize(9).text(t, left + 5, y + 3, { width: width - 10, lineBreak: false }); y += 20; doc.fillColor("#111827"); };
    const kv = (label: string, val: string, x: number, w: number) => { doc.font(body).fontSize(8.5).fillColor("#111827").text(`${label}: `, x, y, { continued: true, lineBreak: false }); doc.fillColor("#1d4ed8").text(val || "—", { lineBreak: false }); doc.fillColor("#111827"); };

    // employee info
    bar("ข้อมูลพนักงาน / Employee Information");
    ensure(15); kv("รหัสพนักงาน / Staff ID", d.employeeCode || "", left, width / 2); kv("บริษัท / Company", d.company || "", left + width / 2, width / 2); y += 15;
    ensure(15); kv("ชื่อ (TH)", d.nameTh || "", left, width / 2); kv("ชื่อ (EN)", d.nameEn || "", left + width / 2, width / 2); y += 15;
    ensure(15); kv("แผนก / Department", d.department || "", left, width / 2); kv("ตำแหน่ง / Position", d.position || "", left + width / 2, width / 2); y += 15;
    ensure(15); kv("ระดับ / Job Level", d.jobLevel || "", left, width / 2); kv("โทร/อีเมล", `${d.phone || ""} ${d.email || ""}`.trim(), left + width / 2, width / 2); y += 15;
    ensure(15); kv("วันที่มีผล / Effective", d.effectiveDate || "", left, width / 2); kv("วันหมดอายุ / Expiry", d.expiryDate || "", left + width / 2, width / 2); y += 15;

    const groupItems = (src: AccessPdfItem["source"]) => d.items.filter((i) => i.source === src);
    const section = (title: string, src: AccessPdfItem["source"]) => {
      const items = groupItems(src);
      bar(title);
      if (items.length === 0) { ensure(13); doc.font(body).fontSize(8).fillColor("#6b7280").text("— ไม่มี / none —", left + 4, y); y += 14; doc.fillColor("#111827"); return; }
      for (const it of items) {
        ensure(13);
        doc.font(body).fontSize(8.5).fillColor("#111827").text(`•  ${it.systemLabel}${it.resource ? ` (${it.resource})` : ""}`, left + 4, y, { width: width * 0.7, lineBreak: false });
        doc.fillColor("#1d4ed8").text(it.permissionLevel, left + width * 0.72, y, { width: width * 0.28, lineBreak: false });
        doc.fillColor("#111827"); y += 13;
      }
      y += 4;
    };
    section("1. สิทธิ์มาตรฐาน / Default Access", "DEFAULT");
    section("2. สิทธิ์ที่ขอเพิ่มเติม / Additional Access Request", "ADDITIONAL");
    section("3. สิทธิ์พิเศษ (ต้องอนุมัติเพิ่ม) / Restricted Access", "RESTRICTED");

    if (d.businessJustification) {
      bar("เหตุผลในการขอสิทธิ์เพิ่มเติม / Business Justification");
      ensure(24); doc.font(body).fontSize(8.5).fillColor("#111827").text(d.businessJustification, left + 4, y, { width: width - 8 }); y = doc.y + 6;
    }
    if (d.approvalChain && d.approvalChain.length) {
      ensure(20); doc.font(body).fontSize(8.5).fillColor("#111827").text("สายการอนุมัติ / Required Approval: ", left, y, { continued: true, lineBreak: false });
      doc.fillColor("#1d4ed8").text(d.approvalChain.join("  →  "), { lineBreak: false }); doc.fillColor("#111827"); y += 18;
    }

    // signatures
    const roles = ["ผู้ขอสิทธิ์ / Requester", "ผู้จัดการแผนก / Dept Manager", "ผู้ตรวจสอบ / IT Support", "หัวหน้าแผนก / IT Manager", "ฝ่ายบริหาร / Management"];
    y += 6; const bw = width / 2, bh = 46;
    for (let i = 0; i < roles.length; i += 2) {
      ensure(bh);
      for (let j = 0; j < 2 && i + j < roles.length; j++) {
        const bx = left + j * bw;
        const isRequester = i + j === 0;
        const name = isRequester ? (d.nameTh || d.nameEn || "").trim() : "";
        const dateStr = isRequester ? (fmtDate(d.effectiveDate) || fmtDate()) : "";
        doc.font(body).fontSize(8).fillColor("#111827");
        doc.text("ลงชื่อ/Sign ............................................", bx, y + 4, { width: bw, align: "center", lineBreak: false });
        if (name) {
          doc.text(`( ${name} )`, bx, y + 18, { width: bw, align: "center", lineBreak: false });
        } else {
          doc.text("(........................................................)", bx, y + 18, { width: bw, align: "center", lineBreak: false });
        }
        doc.fontSize(7.5).fillColor("#6b7280").text(`วันที่ / DD/MM/YYYY ${dateStr || "..................."}`, bx, y + 30, { width: bw, align: "center", lineBreak: false });
        doc.fontSize(8).fillColor("#111827").text(roles[i + j], bx, y + 40, { width: bw, align: "center", lineBreak: false });
      }
      y += bh + 6;
    }
    doc.end();
  });
}

// ---------------------------------------------------------------------------
// ERP access-matrix PDF (form 4.A) — renders ONLY the selected permissions,
// grouped by module, matching the company form layout.
// ---------------------------------------------------------------------------
export function buildAccessMatrixPdf(d: DecodedMatrix): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const thai = loadThaiFont();
    const serif = loadSerifFont();
    const margin = 40;
    const doc = new PDFDocument({ size: "A4", margin, font: "" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    if (thai) doc.registerFont("th", thai);
    const logoFont = serif ? "serif" : thai ? "th" : "Helvetica";
    if (serif) doc.registerFont("serif", serif);
    const body = thai ? "th" : "Helvetica";
    const left = margin, width = doc.page.width - margin * 2, bottom = doc.page.height - margin;
    let y = margin;
    const ensure = (h: number) => { if (y + h > bottom) { doc.addPage(); y = margin; } };
    const r = d.requester;

    // header (CHTNN wordmark)
    doc.font(logoFont).fillColor("#111827");
    const big = 22, sm = 15, kern = 3;
    const wCH = doc.fontSize(sm).widthOfString("CH"), wT = doc.fontSize(big).widthOfString("T"), wNN = doc.fontSize(sm).widthOfString("NN");
    let gx = left + (width - (wCH + kern + wT + kern + wNN)) / 2;
    doc.fontSize(sm).text("CH", gx, margin + (big - sm) * 0.62, { lineBreak: false }); gx += wCH + kern;
    doc.fontSize(big).text("T", gx, margin, { lineBreak: false }); gx += wT + kern;
    doc.fontSize(sm).text("NN", gx, margin + (big - sm) * 0.62, { lineBreak: false });
    doc.font(logoFont).fontSize(10).text("Chaithanin Co.,Ltd.", left, margin + big + 1, { width, align: "center", lineBreak: false });
    doc.font(body).fontSize(8).fillColor("#374151").text(`Ref No : ${r.refNo || "________"}`, left, margin + 2, { width, align: "right", lineBreak: false });
    y = margin + 40;
    doc.font(body).fillColor("#111827").fontSize(13).text("แบบฟอร์มขอสิทธิ์การใช้งานระบบสารสนเทศ", left, y, { width, align: "center" });
    y = doc.y + 1;
    doc.fontSize(9).fillColor("#4b5563").text("Information System Access Request", left, y, { width, align: "center" });
    y = doc.y + 8; doc.fillColor("#111827");

    const bar = (t: string) => { ensure(18); doc.rect(left, y, width, 15).fill("#e5edff"); doc.fillColor("#1e3a8a").font(body).fontSize(9).text(t, left + 5, y + 3, { width: width - 10, lineBreak: false }); y += 20; doc.fillColor("#111827"); };
    const kv = (label: string, val: string, x: number, w: number) => { doc.font(body).fontSize(8.5).fillColor("#111827").text(`${label}: `, x, y, { width: w, continued: true, lineBreak: false }); doc.fillColor("#1d4ed8").text(val || "—", { lineBreak: false }); doc.fillColor("#111827"); };

    // requester
    bar("สำหรับผู้ขอสิทธิ์ / Requester Information");
    ensure(15); kv("รหัสพนักงาน / Staff ID", r.employeeCode, left, width / 2); kv("เริ่มงาน / Start", r.startWork, left + width / 2, width / 2); y += 15;
    ensure(15); kv("ชื่อ-สกุล (TH)", r.nameTh, left, width / 2); kv("ชื่อเล่น / Nickname", r.nickName, left + width / 2, width / 2); y += 15;
    ensure(15); kv("ชื่อ-สกุล (EN)", r.nameEn, left, width); y += 15;
    ensure(15); kv("เบอร์โทร / Phone", r.phone, left, width / 2); kv("อีเมล / Email", r.email, left + width / 2, width / 2); y += 15;
    ensure(15); kv("ตำแหน่ง / Position", r.position, left, width / 2); kv("แผนก / Department", r.department, left + width / 2, width / 2); y += 15;
    if (d.departments.length) { ensure(14); kv("แผนกที่เกี่ยวข้อง / Departments", d.departments.join(", "), left, width); y += 15; }
    if (r.note) { ensure(14); kv("หมายเหตุ / Note", r.note, left, width); y += 15; }
    y += 4;

    const item = (text: string, tail?: string) => {
      ensure(13);
      doc.font(body).fontSize(8.5).fillColor("#111827").text(`•  ${text}`, left + 4, y, { width: width * 0.66, lineBreak: false, ellipsis: true });
      if (tail) doc.fillColor("#1d4ed8").fontSize(8).text(tail, left + width * 0.68, y, { width: width * 0.32, lineBreak: false, ellipsis: true });
      doc.fillColor("#111827"); y += 13;
    };

    // ERP modules (selected only)
    if (d.modules.length) {
      bar("สิทธิ์การใช้งานรายเมนู (ERP) / Per-menu Permissions");
      for (const m of d.modules) {
        ensure(15);
        doc.font(body).fontSize(9).fillColor("#111827").text(m.title, left, y, { width, lineBreak: false, ellipsis: true }); y += 13;
        if (m.moduleAccess) item("เข้าใช้งาน Module นี้ / Module Access", "✔");
        for (const mn of m.menus) item(mn.label, mn.flags.join(", "));
        y += 3;
      }
    }
    // Online Marketing / Sales / Rental (selected only)
    if (d.marketing.length) { bar("Online Marketing Permission"); for (const x of d.marketing) item(x.label, x.cols.join(", ")); }
    if (d.sales.length) { bar("Sales Permission / Venio CRM"); for (const x of d.sales) item(x.label, x.cols.join(", ")); }
    if (d.rental.length) { bar("Rental Permission / Horganice"); for (const x of d.rental) item(x.label, x.cols.join(", ")); }

    if (!d.hasAny) { ensure(16); doc.font(body).fontSize(9).fillColor("#6b7280").text("— ไม่ได้เลือกสิทธิ์ / No permissions selected —", left, y, { width, align: "center" }); y += 16; }

    // Signature block (width-aware so it works 2-up and 3-up).
    const nameTh = (r.nameTh || r.nameEn || "").trim();
    const today = fmtDate();
    const sig = (bx: number, w: number, name: string, dateStr: string, role: string) => {
      doc.font(body).fontSize(8).fillColor("#111827");
      doc.text("ลงชื่อ/Sign ...............................", bx, y + 4, { width: w, align: "center", lineBreak: false });
      doc.text(name ? `( ${name} )` : "(..............................................)", bx, y + 18, { width: w, align: "center", lineBreak: false });
      doc.fontSize(7.5).fillColor("#6b7280").text(`วันที่ / DD/MM/YYYY ${dateStr || "..............."}`, bx, y + 30, { width: w, align: "center", lineBreak: false });
      doc.fontSize(8).fillColor("#111827").text(role, bx, y + 42, { width: w, align: "center", lineBreak: false });
    };

    // Requester + Department Manager signatures.
    ensure(60); y += 8;
    const bw2 = width / 2;
    sig(left, bw2, nameTh, today, "ผู้ขอสิทธิ์ใช้งาน / License Requester");
    sig(left + bw2, bw2, "", "", "ผู้จัดการแผนก / Department Manager");
    y += 60;

    // Conditions (1)–(4), bilingual.
    const note = (th: string, en: string) => {
      ensure(24);
      doc.font(body).fontSize(7).fillColor("#111827").text(th, left, y, { width }); y = doc.y;
      doc.fillColor("#6b7280").text(en, left, y, { width }); y = doc.y + 2; doc.fillColor("#111827");
    };
    ensure(12); doc.font(body).fontSize(7.5).fillColor("#374151").text("เงื่อนไข / Conditions", left, y, { width, lineBreak: false }); y += 11;
    note("(1) ผู้ดูแลระบบจะตรวจสอบความถูกต้อง และเปิดสิทธิ์การใช้งานระบบภายใน 3 วันทำการ",
      "The administrator will verify and activate the system license within 3 working days.");
    note("(2) ผู้ขอสิทธิ์จะต้องทำการยืนยันตัวตนก่อนการเข้าใช้งานทุกครั้ง",
      "The requester must verify identity before accessing every time.");
    note("(3) ผู้ขอสิทธิ์สามารถเข้าใช้งานระบบได้ไม่เกิน 1 ปีนับจากวันที่ยื่นขอสิทธิ์ หากมีความประสงค์ที่จะใช้งานระบบต่อ กรุณายื่นเอกสารขอเปิดสิทธิ์ใหม่อีกครั้ง",
      "The applicant can access the system for no more than 1 year from the date of application submission. If you wish to continue using the system, please submit the documents requesting to reactivate the privilege again.");
    note("(4) เอกสารการขอสิทธิ์จะได้รับการดำเนินการก็ต่อเมื่อ ผู้จัดการแผนกได้ลงนามอนุมัติในเอกสารนี้เท่านั้น หากมิได้มีการลงนามจากผู้จัดการแผนก ถือว่าเอกสารนี้ไม่สมบูรณ์ และจะไม่ได้รับสิทธิ์การเข้าถึงข้อมูลตามที่ร้องขอ",
      "Authorization documents will only be processed if the Department Manager has signed and approved this document. Without the signature of the Department Manager, this document is considered incomplete and will not be given the requested access rights.");
    y += 4;

    // Section 4 — For Access Administrators (checklist + 3 signatures).
    bar("4. สำหรับเจ้าหน้าที่สิทธิ์ผู้ดูแลระบบ / For Access Administrators");
    const bullet = (t: string) => { ensure(22); doc.font(body).fontSize(8).fillColor("#111827").text(`•  ${t}`, left + 4, y, { width: width - 8 }); y = doc.y + 2; };
    bullet("ตรวจสอบความถูกต้อง / Check the Correctness");
    bullet("ยกเลิกสิทธิ์ หรือ บันทึก User & Password เรียบร้อยแล้ว / Close permissions or Save User & Password successfully");
    y += 8;
    ensure(60);
    const bw3 = width / 3;
    sig(left, bw3, "", "", "ผู้ตรวจสอบ / IT Support");
    sig(left + bw3, bw3, "", "", "หัวหน้าแผนก / IT Manager");
    sig(left + bw3 * 2, bw3, "", "", "ฝ่ายบริหาร / Management");
    y += 60;

    doc.end();
  });
}
