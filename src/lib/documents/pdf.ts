import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { FormDef, OptionGroup, Section, SignatureRole, TableSpec } from "./forms";
import { SIGNATURE_LABEL } from "./forms";

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
          doc.font(body).fontSize(8).fillColor("#111827");
          doc.text("ลงชื่อ/Sign ............................................", bx, y + 4, { width: blockW, align: "center", lineBreak: false });
          doc.text("(........................................................)", bx, y + 18, { width: blockW, align: "center", lineBreak: false });
          doc.fontSize(7.5).fillColor("#6b7280").text("วันที่ / DD/MM/YYYY ...................", bx, y + 30, { width: blockW, align: "center", lineBreak: false });
          doc.fontSize(8).fillColor("#111827").text(SIGNATURE_LABEL[role], bx, y + 40, { width: blockW, align: "center", lineBreak: false });
        }
        y += blockH + 6;
      }
    };

    // ---- render ------------------------------------------------------------
    if (form.topGroups) for (const g of form.topGroups) drawGroup(g);
    for (const s of form.sections) drawSection(s);
    drawSignatures(form.requesterSignatures ?? []);
    if (form.adminSection) drawSection(form.adminSection);
    drawSignatures(form.adminSignatures ?? []);

    doc.end();
  });
}
