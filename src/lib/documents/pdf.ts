import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { FormDef, OptionGroup, Section, TableSpec } from "./forms";
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

    const ensure = (h: number) => {
      if (y + h > bottom) { doc.addPage(); y = margin; }
    };

    // ---- header: CHTNN wordmark + title + Ref No ----------------------------
    doc.fillColor("#111827");
    const bigSize = 22, smallSize = 15, kern = 3;
    doc.font(logoFont);
    const wCH = doc.fontSize(smallSize).widthOfString("CH");
    const wT = doc.fontSize(bigSize).widthOfString("T");
    const wNN = doc.fontSize(smallSize).widthOfString("NN");
    const groupW = wCH + kern + wT + kern + wNN;
    let gx = left + (width - groupW) / 2;
    doc.fontSize(smallSize).text("CH", gx, margin + (bigSize - smallSize) * 0.62, { lineBreak: false });
    gx += wCH + kern;
    doc.fontSize(bigSize).text("T", gx, margin, { lineBreak: false });
    gx += wT + kern;
    doc.fontSize(smallSize).text("NN", gx, margin + (bigSize - smallSize) * 0.62, { lineBreak: false });
    doc.font(logoFont).fontSize(10).text("Chaithanin Co.,Ltd.", left, margin + bigSize + 1, { width, align: "center", lineBreak: false });

    // Ref No box (top-right)
    doc.font(body).fontSize(8).fillColor("#374151")
      .text(`Ref No : ${v.get("refNo") || "________"}`, left, margin + 2, { width, align: "right", lineBreak: false });

    // Title
    doc.font(body).fillColor("#111827");
    y = margin + 40;
    doc.fontSize(13).text(form.titleTh, left, y, { width, align: "center" });
    y = doc.y + 1;
    doc.fontSize(9).fillColor("#4b5563").text(form.titleEn, left, y, { width, align: "center" });
    y = doc.y + 8;
    doc.fillColor("#111827");

    // ---- helpers -----------------------------------------------------------
    const checkbox = (x: number, cy: number, checked: boolean) => {
      doc.lineWidth(0.8).rect(x, cy, 8, 8).stroke("#374151");
      if (checked) {
        doc.lineWidth(1).moveTo(x + 1.5, cy + 4).lineTo(x + 3.2, cy + 6.5).lineTo(x + 6.8, cy + 1.5).stroke("#111827");
        doc.lineWidth(0.8);
      }
      doc.fillColor("#111827");
    };

    const drawGroup = (g: OptionGroup) => {
      const selected = new Set(v.getAll(g.name));
      ensure(16);
      doc.font(body).fontSize(8.5).fillColor("#1f2937").text(g.th, left, y, { width, lineBreak: false });
      y += 12;
      const colW = width / 3;
      let i = 0;
      const opts = [...g.options];
      for (const opt of opts) {
        const col = i % 3;
        if (col === 0) ensure(13);
        const x = left + col * colW;
        checkbox(x, y, selected.has(opt.value));
        doc.font(body).fontSize(8).fillColor("#111827")
          .text(opt.th, x + 12, y - 1, { width: colW - 14, lineBreak: false, ellipsis: true });
        i++;
        if (col === 2) y += 13;
      }
      if (i % 3 !== 0) y += 13;
      if (g.other) {
        ensure(13);
        const otherVal = v.get(`${g.name}__other`);
        checkbox(left, y, !!otherVal);
        doc.font(body).fontSize(8).text(`อื่น ๆ / Other: ${otherVal || ""}`, left + 12, y - 1, { width: width - 14, lineBreak: false });
        y += 14;
      }
      y += 4;
    };

    const line = (label: string, value: string, x: number, w: number) => {
      doc.font(body).fontSize(8.5).fillColor("#111827").text(`${label}: `, x, y, { continued: true, lineBreak: false });
      doc.fillColor("#1d4ed8").text(value || "—", { lineBreak: false });
      doc.fillColor("#111827");
    };

    const drawTable = (t: TableSpec) => {
      const totalW = t.columns.reduce((s, c) => s + c.width, 0);
      const colX: number[] = [];
      let cx = left;
      for (const c of t.columns) { colX.push(cx); cx += (c.width / totalW) * width; }
      colX.push(left + width);
      const rowH = 16;
      ensure(rowH + 4);
      // header
      doc.rect(left, y, width, rowH).fill("#e5edff");
      doc.fillColor("#1e3a8a").font(body).fontSize(7.5);
      t.columns.forEach((c, i) => doc.text(c.th, colX[i] + 3, y + 4, { width: colX[i + 1] - colX[i] - 6, lineBreak: false, ellipsis: true }));
      // grid + values
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
            ensure(28);
            doc.font(body).fontSize(8.5).text(`${f.th}:`, left, y, { width, lineBreak: false });
            y += 12;
            doc.fillColor("#1d4ed8").fontSize(8.5).text(v.get(f.name) || "—", left + 6, y, { width: width - 6 });
            y = doc.y + 6; doc.fillColor("#111827");
          } else if (f.half && i + 1 < s.fields.length && s.fields[i + 1].half) {
            ensure(16);
            const half = width / 2 - 6;
            line(f.th, v.get(f.name), left, half);
            const f2 = s.fields[i + 1];
            doc.font(body).fontSize(8.5).fillColor("#111827").text(`${f2.th}: `, left + width / 2, y, { continued: true, lineBreak: false });
            doc.fillColor("#1d4ed8").text(v.get(f2.name) || "—", { lineBreak: false });
            doc.fillColor("#111827");
            y += 15; i++;
          } else {
            ensure(15);
            line(f.th, v.get(f.name), left, width);
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

    // ---- render ------------------------------------------------------------
    if (form.topGroups) for (const g of form.topGroups) drawGroup(g);
    for (const s of form.sections) drawSection(s);

    // ---- signatures --------------------------------------------------------
    if (form.signatures.length) {
      y += 8;
      const perRow = 2;
      const blockW = width / perRow;
      const blockH = 46;
      for (let i = 0; i < form.signatures.length; i += perRow) {
        ensure(blockH);
        for (let j = 0; j < perRow && i + j < form.signatures.length; j++) {
          const role = form.signatures[i + j];
          const bx = left + j * blockW;
          const cxc = bx + blockW / 2;
          doc.font(body).fontSize(8).fillColor("#111827");
          doc.text("ลงชื่อ/Sign ............................................", bx, y + 4, { width: blockW, align: "center", lineBreak: false });
          doc.text("(........................................................)", bx, y + 18, { width: blockW, align: "center", lineBreak: false });
          doc.fontSize(7.5).fillColor("#6b7280").text("วันที่ / DD/MM/YYYY ...................", bx, y + 30, { width: blockW, align: "center", lineBreak: false });
          doc.fontSize(8).fillColor("#111827").text(SIGNATURE_LABEL[role], bx, y + 40, { width: blockW, align: "center", lineBreak: false });
          void cxc;
        }
        y += blockH + 6;
      }
    }

    doc.end();
  });
}
