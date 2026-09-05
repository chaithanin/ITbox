import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_ROWS = 5000;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// canonical column -> accepted header aliases (normalized)
const ALIASES: Record<string, string[]> = {
  phoneNumber: ["phonenumber", "phone", "number", "เบอร์", "เบอร์โทร"],
  carrier: ["carrier", "network", "ค่าย"],
  provider: ["provider"], // "GTG(AIS)" -> carrier + accountName
  accountName: ["accountname", "account", "group", "บัญชี"],
  holder: ["holder", "user", "owner", "ผู้ถือ", "ผู้ถือครอง"],
  status: ["status", "สถานะ"],
  simSerial: ["simserial", "serial", "sim"],
  plan: ["plan", "package", "แพ็กเกจ"],
  monthlyFee: ["monthlyfee", "fee", "ค่าบริการ"],
  department: ["department", "dept", "แผนก"],
  notes: ["notes", "note", "remark", "หมายเหตุ"],
};

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, "");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); field = ""; row = []; }
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function parseXlsx(buf: ArrayBuffer): Promise<string[][] | null> {
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.worksheets[0];
    if (!ws) return null;
    const rows: string[][] = [];
    ws.eachRow((row) => {
      const vals: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        let v = row.getCell(c).value as unknown;
        if (v && typeof v === "object") {
          const o = v as Record<string, unknown>;
          if ("text" in o) v = o.text; else if ("result" in o) v = o.result;
          else if ("richText" in o && Array.isArray(o.richText)) v = (o.richText as { text: string }[]).map((t) => t.text).join("");
        }
        vals.push(v == null ? "" : String(v).trim());
      }
      rows.push(vals);
    });
    return rows;
  } catch { return null; }
}

function mapStatus(s: string): "ACTIVE" | "UNUSED" | "SUSPENDED" | "TERMINATED" {
  const v = s.trim().toLowerCase();
  if (["unused", "ว่าง", "ไม่ใช้", "spare"].some((x) => v.includes(x))) return "UNUSED";
  if (["suspend", "ระงับ"].some((x) => v.includes(x))) return "SUSPENDED";
  if (["terminate", "ยกเลิก", "cancel"].some((x) => v.includes(x))) return "TERMINATED";
  return "ACTIVE";
}

/** "GTG(AIS)" -> { carrier:"AIS", accountName:"GTG" } ; "AIS" -> carrier only */
function splitProvider(p: string): { carrier: string; accountName: string | null } {
  const m = p.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { carrier: m[2].trim(), accountName: m[1].trim() || null };
  return { carrier: p.trim(), accountName: null };
}

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("sim:manage");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "missing_file", message: "ไม่พบไฟล์ / No file" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "file_too_large", message: "ไฟล์เกิน 4MB" }, { status: 400 });

  const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.type === XLSX_MIME;
  let rows = isXlsx ? (await parseXlsx(await file.arrayBuffer())) : parseCsv(await file.text());
  if (!rows) return NextResponse.json({ error: "invalid_file", message: "อ่านไฟล์ไม่ได้" }, { status: 400 });
  rows = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) return NextResponse.json({ error: "empty", message: "ไม่มีข้อมูล" }, { status: 400 });

  const header = rows[0];
  const idx: Record<string, number> = {};
  header.forEach((h, i) => {
    for (const [canon, al] of Object.entries(ALIASES)) {
      if ((al.includes(norm(h)) || norm(canon) === norm(h)) && idx[canon] === undefined) idx[canon] = i;
    }
  });
  if (idx.phoneNumber === undefined) return NextResponse.json({ error: "missing_column", message: "ขาดคอลัมน์ phoneNumber" }, { status: 400 });

  const data = rows.slice(1);
  if (data.length > MAX_ROWS) return NextResponse.json({ error: "too_many_rows", message: `เกิน ${MAX_ROWS} แถว` }, { status: 400 });

  const orgId = user.organizationId;
  const depts = await prisma.department.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true } });
  const deptMap = new Map(depts.map((d) => [d.name.toLowerCase(), d.id]));
  const cell = (r: string[], c: string) => (idx[c] === undefined ? "" : (r[idx[c]] ?? "").trim());

  const errors: { row: number; phoneNumber: string; error: string }[] = [];
  const seen = new Set<string>();
  let created = 0, updated = 0;

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    const rowNo = i + 2;
    const phoneNumber = cell(r, "phoneNumber").replace(/\s+/g, "");
    if (!phoneNumber) { errors.push({ row: rowNo, phoneNumber: "", error: "phoneNumber ว่าง" }); continue; }
    if (seen.has(phoneNumber.toLowerCase())) { errors.push({ row: rowNo, phoneNumber, error: "ซ้ำในไฟล์" }); continue; }
    seen.add(phoneNumber.toLowerCase());

    let carrier = cell(r, "carrier");
    let accountName: string | null = cell(r, "accountName") || null;
    const provider = cell(r, "provider");
    if (!carrier && provider) { const sp = splitProvider(provider); carrier = sp.carrier; accountName = accountName ?? sp.accountName; }
    if (!carrier) carrier = "OTHER";

    const feeRaw = cell(r, "monthlyFee");
    const fee = feeRaw ? Number(feeRaw.replace(/[^0-9.]/g, "")) : null;
    const deptId = deptMap.get(cell(r, "department").toLowerCase()) ?? null;

    const payload = {
      carrier, accountName,
      holder: cell(r, "holder") || null,
      status: mapStatus(cell(r, "status")),
      simSerial: cell(r, "simSerial") || null,
      plan: cell(r, "plan") || null,
      monthlyFee: fee != null && !Number.isNaN(fee) ? fee : null,
      departmentId: deptId,
      notes: cell(r, "notes") || null,
    };

    try {
      const existing = await prisma.simCard.findFirst({ where: { organizationId: orgId, phoneNumber }, select: { id: true } });
      if (existing) { await prisma.simCard.update({ where: { id: existing.id }, data: { ...payload, deletedAt: null } }); updated++; }
      else { await prisma.simCard.create({ data: { organizationId: orgId, phoneNumber, ...payload } }); created++; }
    } catch (e) {
      errors.push({ row: rowNo, phoneNumber, error: (e as Error).message.slice(0, 200) });
    }
  }

  await auditLog(user, { action: "IMPORT", entityType: "SIM", detail: { created, updated, failed: errors.length } });
  return NextResponse.json({ created, updated, failed: errors.length, errors: errors.slice(0, 500) });
});
