import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB
const MAX_DATA_ROWS = 5000;
const MAX_ERRORS_RETURNED = 500;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Accepted header names → canonical column. Case/space-insensitive.
const COLUMNS = [
  "employeeCode", "firstName", "lastName", "email", "phone",
  "position", "department", "location", "status", "startDate",
] as const;
type ColumnName = (typeof COLUMNS)[number];

const STATUSES = ["ACTIVE", "ON_LEAVE", "OFFBOARDING", "RESIGNED"] as const;
type StatusValue = (typeof STATUSES)[number];

interface RowError {
  row: number;
  employeeCode: string;
  error: string;
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, "");
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
          if ("text" in o) v = o.text;
          else if ("result" in o) v = o.result;
          else if ("richText" in o && Array.isArray(o.richText))
            v = (o.richText as { text: string }[]).map((t) => t.text).join("");
          else if (v instanceof Date) v = v.toISOString().slice(0, 10);
        }
        vals.push(v == null ? "" : String(v).trim());
      }
      rows.push(vals);
    });
    return rows;
  } catch {
    return null;
  }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); field = ""; row = []; }
    else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("employee:create");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing_file", message: "ไม่พบไฟล์ / No file uploaded" },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", message: "ไฟล์เกิน 4MB / File exceeds 4MB" },
      { status: 400 }
    );
  }

  const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.type === XLSX_MIME;
  let rows: string[][];
  if (isXlsx) {
    const parsed = await parseXlsx(await file.arrayBuffer());
    if (!parsed) {
      return NextResponse.json(
        { error: "invalid_file", message: "อ่านไฟล์ .xlsx ไม่ได้ / Could not read .xlsx" },
        { status: 400 }
      );
    }
    rows = parsed;
  } else {
    rows = parseCsv(await file.text());
  }

  rows = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) {
    return NextResponse.json(
      { error: "empty", message: "ไม่มีข้อมูล (ต้องมีหัวตาราง + อย่างน้อย 1 แถว)" },
      { status: 400 }
    );
  }

  // Header map
  const header = rows[0];
  const colIndex = new Map<ColumnName, number>();
  header.forEach((h, i) => {
    const key = COLUMNS.find((c) => norm(c) === norm(h));
    if (key && !colIndex.has(key)) colIndex.set(key, i);
  });
  for (const req of ["employeeCode", "firstName", "lastName"] as ColumnName[]) {
    if (!colIndex.has(req)) {
      return NextResponse.json(
        { error: "missing_column", message: `ขาดคอลัมน์ที่จำเป็น: ${req}` },
        { status: 400 }
      );
    }
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_DATA_ROWS) {
    return NextResponse.json(
      { error: "too_many_rows", message: `เกิน ${MAX_DATA_ROWS} แถว` },
      { status: 400 }
    );
  }

  const orgId = user.organizationId;
  const cell = (r: string[], c: ColumnName) => {
    const i = colIndex.get(c);
    return i === undefined ? "" : (r[i] ?? "").trim();
  };

  // Preload departments/locations (name → id), create missing on the fly.
  const [depts, locs] = await Promise.all([
    prisma.department.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true, code: true } }),
    prisma.location.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, name: true, code: true } }),
  ]);
  const deptMap = new Map(depts.map((d) => [d.name.toLowerCase(), d.id]));
  const locMap = new Map(locs.map((l) => [l.name.toLowerCase(), l.id]));
  const deptCodes = new Set(depts.map((d) => d.code.toUpperCase()));
  const locCodes = new Set(locs.map((l) => l.code.toUpperCase()));

  // Derive a unique code from a name (unique within the org for its kind).
  const uniqueCode = (name: string, prefix: string, taken: Set<string>) => {
    const base =
      name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) ||
      `${prefix}${Math.abs([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 100000}`;
    let code = base;
    let n = 1;
    while (taken.has(code.toUpperCase())) code = `${base.slice(0, 14)}-${++n}`;
    taken.add(code.toUpperCase());
    return code;
  };
  async function resolveDept(name: string): Promise<string | null> {
    if (!name) return null;
    const hit = deptMap.get(name.toLowerCase());
    if (hit) return hit;
    const created = await prisma.department.create({
      data: { organizationId: orgId, name, code: uniqueCode(name, "DEPT", deptCodes) },
    });
    deptMap.set(name.toLowerCase(), created.id);
    return created.id;
  }
  async function resolveLoc(name: string): Promise<string | null> {
    if (!name) return null;
    const hit = locMap.get(name.toLowerCase());
    if (hit) return hit;
    const created = await prisma.location.create({
      data: { organizationId: orgId, name, code: uniqueCode(name, "LOC", locCodes) },
    });
    locMap.set(name.toLowerCase(), created.id);
    return created.id;
  }

  const errors: RowError[] = [];
  const seen = new Set<string>();
  let created = 0, updated = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    const rowNumber = i + 2; // 1-based + header
    const employeeCode = cell(r, "employeeCode");
    const firstName = cell(r, "firstName");
    const lastName = cell(r, "lastName");
    const rowErrors: string[] = [];

    if (!employeeCode) rowErrors.push("employeeCode ว่าง");
    if (!firstName) rowErrors.push("firstName ว่าง");
    if (!lastName) rowErrors.push("lastName ว่าง");
    if (employeeCode && seen.has(employeeCode.toLowerCase())) rowErrors.push("employeeCode ซ้ำในไฟล์");

    const email = cell(r, "email");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) rowErrors.push("อีเมลไม่ถูกต้อง");

    const statusRaw = cell(r, "status").toUpperCase().replace(/\s+/g, "_");
    const status: StatusValue = (STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as StatusValue)
      : "ACTIVE";

    if (rowErrors.length) {
      errors.push({ row: rowNumber, employeeCode, error: rowErrors.join("; ") });
      continue;
    }
    seen.add(employeeCode.toLowerCase());

    try {
      const departmentId = await resolveDept(cell(r, "department"));
      const locationId = await resolveLoc(cell(r, "location"));
      const data = {
        firstName, lastName,
        email: email || null,
        phone: cell(r, "phone") || null,
        position: cell(r, "position") || null,
        departmentId, locationId, status,
        startDate: parseDate(cell(r, "startDate")),
      };
      const existing = await prisma.employee.findFirst({
        where: { organizationId: orgId, employeeCode, deletedAt: null },
        select: { id: true },
      });
      if (existing) {
        await prisma.employee.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.employee.create({ data: { organizationId: orgId, employeeCode, ...data } });
        created++;
      }
    } catch (e) {
      errors.push({ row: rowNumber, employeeCode, error: (e as Error).message.slice(0, 200) });
    }
  }

  await auditLog(user, {
    action: "IMPORT", entityType: "EMPLOYEE",
    detail: { created, updated, failed: errors.length },
  });

  return NextResponse.json({
    created, updated, failed: errors.length,
    errors: errors.slice(0, MAX_ERRORS_RETURNED),
  });
});
