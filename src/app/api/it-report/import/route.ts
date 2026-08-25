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

const CATEGORIES = ["SERVER", "BACKUP", "STORAGE", "CCTV", "PHONE", "GPS", "LOG", "MANGO_LOGIN", "MANGO_USAGE", "OTHER"] as const;
const STATUSES = ["NORMAL", "WARNING", "CRITICAL", "NOT_CHECKED"] as const;
const MODES = ["AUTO", "CHECK_REQUIRED", "ISSUE"] as const;
type Category = (typeof CATEGORIES)[number];
type Status = (typeof STATUSES)[number];
type Mode = (typeof MODES)[number];

const COLUMNS = [
  "checkDate", "category", "name", "location", "mode", "status",
  "healthPercent", "note", "online", "recording", "lastRecording",
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

function todayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const GET = apiHandler(async () => {
  await requirePermission("support:work");
  const example: Record<ColumnName, string> = {
    checkDate: "2025-08-13",
    category: "CCTV",
    name: "Paradise DVR1",
    location: "Paradise",
    mode: "CHECK_REQUIRED",
    status: "CRITICAL",
    healthPercent: "",
    note: "16 cameras offline",
    online: "Offline",
    recording: "Missing",
    lastRecording: "2025-08-07",
  };
  const csv = "﻿" + [COLUMNS.map(esc).join(","), COLUMNS.map((c) => esc(example[c])).join(",")].join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="it-health-import-template.csv"' },
  });
});

interface RowError { row: number; name: string; error: string; }

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("support:work");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "missing_file", message: "ไม่พบไฟล์ / No file" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: "file_too_large", message: "ไฟล์เกิน 2MB" }, { status: 400 });

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
  if (!colIndex.has("category") || !colIndex.has("name")) {
    return NextResponse.json({ error: "invalid_header", message: "Header must include category and name / ต้องมี category และ name" }, { status: 400 });
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_DATA_ROWS) return NextResponse.json({ error: "too_many_rows", message: `เกิน ${MAX_DATA_ROWS} แถว` }, { status: 400 });

  const cell = (r: string[], col: ColumnName): string => {
    const idx = colIndex.get(col);
    return idx === undefined ? "" : (r[idx] ?? "").trim();
  };

  const locations = await prisma.location.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  const locByName = new Map(locations.map((l) => [l.name.toLowerCase(), l.id]));

  const errors: RowError[] = [];
  interface Prepared {
    checkDate: Date; category: Category; name: string; locationId: string | null;
    mode: Mode; status: Status; healthPercent: number | null;
    metrics: Record<string, string> | null; note: string | null;
  }
  const prepared: Prepared[] = [];
  const seen = new Set<string>();

  dataRows.forEach((r, i) => {
    const rowNumber = i + 2;
    const name = cell(r, "name");
    const rowErrors: string[] = [];
    if (!name) rowErrors.push("name is required / ต้องระบุ name");

    const catRaw = cell(r, "category").toUpperCase().replace(/[\s-]+/g, "_");
    const category = (CATEGORIES as readonly string[]).includes(catRaw) ? (catRaw as Category) : null;
    if (!category) rowErrors.push(`Invalid category "${cell(r, "category")}"`);

    const dateRaw = cell(r, "checkDate");
    let checkDate = todayUtc();
    if (dateRaw) {
      const d = parseDateOnly(dateRaw);
      if (d) checkDate = d;
      else rowErrors.push(`Invalid checkDate "${dateRaw}" (YYYY-MM-DD)`);
    }

    let status: Status = "NOT_CHECKED";
    const statusRaw = cell(r, "status").toUpperCase().replace(/[\s-]+/g, "_");
    if (statusRaw) {
      if ((STATUSES as readonly string[]).includes(statusRaw)) status = statusRaw as Status;
      else rowErrors.push(`Invalid status "${cell(r, "status")}"`);
    }

    let mode: Mode = "CHECK_REQUIRED";
    const modeRaw = cell(r, "mode").toUpperCase().replace(/[\s-]+/g, "_");
    if (modeRaw) {
      if ((MODES as readonly string[]).includes(modeRaw)) mode = modeRaw as Mode;
      else rowErrors.push(`Invalid mode "${cell(r, "mode")}"`);
    }

    let healthPercent: number | null = null;
    const hpRaw = cell(r, "healthPercent");
    if (hpRaw) {
      const n = Number(hpRaw);
      if (Number.isInteger(n) && n >= 0 && n <= 100) healthPercent = n;
      else rowErrors.push(`Invalid healthPercent "${hpRaw}"`);
    }

    // CCTV / generic extra metrics
    const metrics: Record<string, string> = {};
    const online = cell(r, "online"); if (online) metrics.online = online;
    const recording = cell(r, "recording"); if (recording) metrics.recording = recording;
    const lastRecording = cell(r, "lastRecording"); if (lastRecording) metrics.lastRecording = lastRecording;

    const locRaw = cell(r, "location");
    const locationId = locRaw ? locByName.get(locRaw.toLowerCase()) ?? null : null;

    const dedupKey = category ? `${checkDate.toISOString().slice(0, 10)}|${category}|${name.toLowerCase()}` : "";
    if (dedupKey && seen.has(dedupKey)) rowErrors.push("Duplicate (date+category+name) within file");

    if (rowErrors.length > 0 || !category) {
      errors.push({ row: rowNumber, name, error: rowErrors.join("; ") });
      return;
    }
    seen.add(dedupKey);
    prepared.push({
      checkDate, category, name, locationId, mode, status, healthPercent,
      metrics: Object.keys(metrics).length > 0 ? metrics : null,
      note: cell(r, "note") || null,
    });
  });

  let created = 0, updated = 0;
  for (const p of prepared) {
    const res = await prisma.itHealthCheck.upsert({
      where: {
        organizationId_checkDate_category_name: {
          organizationId: user.organizationId, checkDate: p.checkDate, category: p.category, name: p.name,
        },
      },
      create: {
        organizationId: user.organizationId, checkDate: p.checkDate, category: p.category, name: p.name,
        locationId: p.locationId, mode: p.mode, status: p.status, healthPercent: p.healthPercent,
        metrics: p.metrics ?? undefined, note: p.note, checkedById: user.id,
      },
      update: {
        locationId: p.locationId, mode: p.mode, status: p.status, healthPercent: p.healthPercent,
        metrics: p.metrics ?? undefined, note: p.note, checkedById: user.id,
      },
      select: { createdAt: true, updatedAt: true },
    });
    if (res.createdAt.getTime() === res.updatedAt.getTime()) created++;
    else updated++;
  }

  await auditLog(user, { action: "IMPORT", entityType: "IT_HEALTH_CHECK", detail: { created, updated, failed: errors.length, fileName: file.name, format: sourceFormat } });

  return NextResponse.json({ created, updated, failed: errors.length, errors: errors.slice(0, MAX_ERRORS_RETURNED) });
});
