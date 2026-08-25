import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_DATA_ROWS = 5000;
const MAX_ERRORS_RETURNED = 500;
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const LICENSE_TYPES = ["PERPETUAL", "SUBSCRIPTION", "OEM", "VOLUME"] as const;
type LicenseTypeValue = (typeof LICENSE_TYPES)[number];

const COLUMNS = [
  "softwareName", "licenseType", "totalSeats", "vendor",
  "purchaseDate", "startDate", "expiresAt", "cost", "notes",
] as const;
type ColumnName = (typeof COLUMNS)[number];

function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false, i = 0;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; } else { inQuotes = false; i += 1; } }
      else { field += c; i += 1; }
    } else if (c === '"') { inQuotes = true; i += 1; }
    else if (c === ",") { pushField(); i += 1; }
    else if (c === "\r") { pushRow(); i += text[i + 1] === "\n" ? 2 : 1; }
    else if (c === "\n") { pushRow(); i += 1; }
    else { field += c; i += 1; }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

async function parseXlsx(buffer: ArrayBuffer): Promise<string[][] | null> {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer); } catch { return null; }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  const colCount = sheet.columnCount;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let c = 1; c <= colCount; c++) values.push(row.getCell(c).text ?? "");
    if (values.some((v) => v.trim() !== "")) rows.push(values);
  });
  return rows;
}

function esc(v: string): string { return `"${v.replaceAll('"', '""')}"`; }

function parseDateOnly(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== v) return null;
  return d;
}

export const GET = apiHandler(async () => {
  await requirePermission("license:manage");
  const example: Record<ColumnName, string> = {
    softwareName: "Microsoft Office Home 2024",
    licenseType: "PERPETUAL",
    totalSeats: "10",
    vendor: "Microsoft",
    purchaseDate: "2026-01-15",
    startDate: "2026-01-15",
    expiresAt: "2029-01-14",
    cost: "12000.00",
    notes: "Bulk import",
  };
  const csv = "﻿" +
    [COLUMNS.map(esc).join(","), COLUMNS.map((c) => esc(example[c])).join(",")].join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="license-import-template.csv"',
    },
  });
});

interface RowError { row: number; softwareName: string; error: string; }

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("license:manage");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file", message: "No CSV/Excel file uploaded / ไม่พบไฟล์" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "file_too_large", message: "File exceeds 2MB / ไฟล์เกิน 2MB" }, { status: 400 });
  }

  const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.type === XLSX_MIME;
  const sourceFormat = isXlsx ? "xlsx" : "csv";
  let rows: string[][];
  if (isXlsx) {
    const parsed = await parseXlsx(await file.arrayBuffer());
    if (parsed === null) return NextResponse.json({ error: "invalid_file", message: "อ่านไฟล์ .xlsx ไม่ได้" }, { status: 400 });
    rows = parsed;
  } else {
    rows = parseCsv(await file.text());
  }
  if (rows.length < 1) return NextResponse.json({ error: "empty_file", message: "ไฟล์ว่างเปล่า" }, { status: 400 });

  const headerRow = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = new Map<ColumnName, number>();
  for (const col of COLUMNS) {
    const idx = headerRow.indexOf(col.toLowerCase());
    if (idx >= 0) colIndex.set(col, idx);
  }
  if (!colIndex.has("softwareName")) {
    return NextResponse.json(
      { error: "invalid_header", message: "Header must include softwareName / แถวหัวตารางต้องมี softwareName" },
      { status: 400 }
    );
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_DATA_ROWS) {
    return NextResponse.json({ error: "too_many_rows", message: `เกิน ${MAX_DATA_ROWS} แถว` }, { status: 400 });
  }

  const cell = (r: string[], col: ColumnName): string => {
    const idx = colIndex.get(col);
    return idx === undefined ? "" : (r[idx] ?? "").trim();
  };

  const vendors = await prisma.vendor.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  const vendorByName = new Map(vendors.map((v) => [v.name.toLowerCase(), v.id]));

  const errors: RowError[] = [];
  const valid: {
    softwareName: string; licenseType: LicenseTypeValue | null; totalSeats: number;
    vendorId: string | null; purchaseDate: Date | null; startDate: Date | null;
    expiresAt: Date | null; cost: string | null; notes: string | null;
  }[] = [];

  dataRows.forEach((r, i) => {
    const rowNumber = i + 2;
    const softwareName = cell(r, "softwareName");
    const rowErrors: string[] = [];
    if (!softwareName) rowErrors.push("softwareName is required / ต้องระบุ softwareName");

    let licenseType: LicenseTypeValue | null = null;
    const ltRaw = cell(r, "licenseType");
    if (ltRaw) {
      const up = ltRaw.toUpperCase();
      if ((LICENSE_TYPES as readonly string[]).includes(up)) licenseType = up as LicenseTypeValue;
      else rowErrors.push(`Invalid licenseType "${ltRaw}"`);
    }

    let totalSeats = 1;
    const seatsRaw = cell(r, "totalSeats");
    if (seatsRaw) {
      const n = Number(seatsRaw);
      if (Number.isInteger(n) && n >= 1 && n <= 100000) totalSeats = n;
      else rowErrors.push(`Invalid totalSeats "${seatsRaw}"`);
    }

    const dates: Partial<Record<"purchaseDate" | "startDate" | "expiresAt", Date>> = {};
    for (const dc of ["purchaseDate", "startDate", "expiresAt"] as const) {
      const v = cell(r, dc);
      if (!v) continue;
      const d = parseDateOnly(v);
      if (d) dates[dc] = d;
      else rowErrors.push(`Invalid ${dc} "${v}" (YYYY-MM-DD)`);
    }

    let cost: string | null = null;
    const costRaw = cell(r, "cost");
    if (costRaw) {
      const n = Number(costRaw);
      if (Number.isFinite(n) && n >= 0) cost = costRaw;
      else rowErrors.push(`Invalid cost "${costRaw}"`);
    }

    const vendorRaw = cell(r, "vendor");
    const vendorId = vendorRaw ? vendorByName.get(vendorRaw.toLowerCase()) ?? null : null;

    if (rowErrors.length > 0) {
      errors.push({ row: rowNumber, softwareName, error: rowErrors.join("; ") });
      return;
    }
    valid.push({
      softwareName, licenseType, totalSeats, vendorId,
      purchaseDate: dates.purchaseDate ?? null,
      startDate: dates.startDate ?? null,
      expiresAt: dates.expiresAt ?? null,
      cost, notes: cell(r, "notes") || null,
    });
  });

  let created = 0;
  if (valid.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const v of valid) {
        await tx.license.create({
          data: {
            organizationId: user.organizationId,
            softwareName: v.softwareName,
            licenseType: v.licenseType,
            totalSeats: v.totalSeats,
            vendorId: v.vendorId,
            purchaseDate: v.purchaseDate,
            startDate: v.startDate,
            expiresAt: v.expiresAt,
            cost: v.cost,
            notes: v.notes,
          },
        });
        created += 1;
      }
    });
  }

  await auditLog(user, {
    action: "IMPORT",
    entityType: "LICENSE",
    detail: { created, failed: errors.length, fileName: file.name, format: sourceFormat },
  });

  return NextResponse.json({ created, failed: errors.length, errors: errors.slice(0, MAX_ERRORS_RETURNED) });
});
