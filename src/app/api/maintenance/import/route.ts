import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_DATA_ROWS = 2000;
const MAX_ERRORS_RETURNED = 500;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_PART",
  "WAITING_VENDOR",
  "COMPLETED",
  "CANCELLED",
] as const;
// Statuses that represent an actively-open ticket — only these flip the linked
// asset to IN_REPAIR. Historical COMPLETED/CANCELLED rows leave the asset alone.
const OPEN_STATUSES = new Set(["OPEN", "IN_PROGRESS", "WAITING_PART", "WAITING_VENDOR"]);

type PriorityValue = (typeof PRIORITIES)[number];
type StatusValue = (typeof STATUSES)[number];

const COLUMNS = [
  "assetTag",
  "assetName",
  "problem",
  "solution",
  "priority",
  "status",
  "technicianName",
  "vendor",
  "requestBy",
  "userName",
  "startedAt",
  "completedAt",
  "repairCost",
  "remark",
] as const;

type ColumnName = (typeof COLUMNS)[number];

// ------------------------------------------------------------------
// Small robust CSV parser (RFC 4180-ish)
// ------------------------------------------------------------------

function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += c;
        i += 1;
      }
    } else if (c === '"') {
      inQuotes = true;
      i += 1;
    } else if (c === ",") {
      pushField();
      i += 1;
    } else if (c === "\r") {
      pushRow();
      i += text[i + 1] === "\n" ? 2 : 1;
    } else if (c === "\n") {
      pushRow();
      i += 1;
    } else {
      field += c;
      i += 1;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

// ------------------------------------------------------------------
// XLSX parser — first worksheet, row 1 = headers.
// ------------------------------------------------------------------

async function parseXlsx(buffer: ArrayBuffer): Promise<string[][] | null> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return null;
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  const colCount = sheet.columnCount;
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let c = 1; c <= colCount; c++) {
      values.push(row.getCell(c).text ?? "");
    }
    if (values.some((v) => v.trim() !== "")) rows.push(values);
  });
  return rows;
}

/** CSV-escape a value for output. */
function esc(v: string): string {
  return `"${v.replaceAll('"', '""')}"`;
}

/** Parse a strict YYYY-MM-DD date. Returns null if invalid. */
function parseDateOnly(v: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.toISOString().slice(0, 10) !== v) return null;
  return d;
}

/** Parse a loose cost value like "990.-", "1,700.-", "1200" → number|null. */
function parseCost(v: string): number | null {
  if (!v) return null;
  const cleaned = v.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!cleaned || cleaned === ".") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

// ------------------------------------------------------------------
// GET — CSV template
// ------------------------------------------------------------------

export const GET = apiHandler(async () => {
  await requirePermission("maintenance:manage");

  const example: Record<ColumnName, string> = {
    assetTag: "IT-NB-0001",
    assetName: "computer Lenovo",
    problem: "OS slow",
    solution: "Changed internal storage",
    priority: "MEDIUM",
    status: "COMPLETED",
    technicianName: "Aek",
    vendor: "",
    requestBy: "K'Daniel-CEO",
    userName: "K'Air",
    startedAt: "2023-10-10",
    completedAt: "2023-10-11",
    repairCost: "990",
    remark: "",
  };

  const csv =
    "﻿" +
    [COLUMNS.map(esc).join(","), COLUMNS.map((c) => esc(example[c])).join(",")].join("\r\n") +
    "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="maintenance-import-template.csv"',
    },
  });
});

// ------------------------------------------------------------------
// POST — bulk import
// ------------------------------------------------------------------

interface RowError {
  row: number;
  reference: string;
  error: string;
}

interface PreparedRow {
  rowNumber: number;
  reference: string;
  problem: string;
  diagnosis: string | null;
  priority: PriorityValue;
  status: StatusValue;
  technicianId: string | null;
  vendorId: string | null;
  repairCost: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  remark: string | null;
  // Asset resolution: either an existing id, or a request to create one.
  assetId: string | null;
  createAsset: { name: string } | null;
}

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("maintenance:manage");

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing_file", message: "No CSV/Excel file uploaded / ไม่พบไฟล์ CSV หรือ Excel (.xlsx)" },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", message: "File exceeds 2MB limit / ไฟล์เกิน 2MB" },
      { status: 400 }
    );
  }

  const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.type === XLSX_MIME;
  const sourceFormat = isXlsx ? "xlsx" : "csv";

  let rows: string[][];
  if (isXlsx) {
    const parsed = await parseXlsx(await file.arrayBuffer());
    if (parsed === null) {
      return NextResponse.json(
        { error: "invalid_file", message: "Could not read the .xlsx file / ไม่สามารถอ่านไฟล์ .xlsx ได้" },
        { status: 400 }
      );
    }
    rows = parsed;
  } else {
    rows = parseCsv(await file.text());
  }

  if (rows.length < 1) {
    return NextResponse.json(
      { error: "empty_file", message: "File is empty / ไฟล์ว่างเปล่า" },
      { status: 400 }
    );
  }

  const headerRow = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = new Map<ColumnName, number>();
  for (const col of COLUMNS) {
    const idx = headerRow.indexOf(col.toLowerCase());
    if (idx >= 0) colIndex.set(col, idx);
  }
  if (!colIndex.has("problem") || (!colIndex.has("assetTag") && !colIndex.has("assetName"))) {
    return NextResponse.json(
      {
        error: "invalid_header",
        message:
          "Header must include 'problem' and at least one of 'assetTag' or 'assetName' / แถวหัวตารางต้องมี problem และ assetTag หรือ assetName",
      },
      { status: 400 }
    );
  }

  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_DATA_ROWS) {
    return NextResponse.json(
      {
        error: "too_many_rows",
        message: `Too many rows (max ${MAX_DATA_ROWS}) / จำนวนแถวเกินกำหนด (สูงสุด ${MAX_DATA_ROWS})`,
      },
      { status: 400 }
    );
  }

  const cell = (r: string[], col: ColumnName): string => {
    const idx = colIndex.get(col);
    if (idx === undefined) return "";
    return (r[idx] ?? "").trim();
  };

  // ---- Prefetch org data ----
  const orgWhere = { organizationId: user.organizationId, deletedAt: null };
  const [assets, vendors, employees, existingTickets] = await Promise.all([
    prisma.asset.findMany({ where: orgWhere, select: { id: true, assetTag: true, name: true } }),
    prisma.vendor.findMany({ where: orgWhere, select: { id: true, name: true } }),
    prisma.employee.findMany({ where: orgWhere, select: { id: true, firstName: true, lastName: true } }),
    prisma.maintenanceTicket.findMany({
      where: { organizationId: user.organizationId },
      select: { ticketNumber: true },
    }),
  ]);

  const assetByTag = new Map(assets.map((a) => [a.assetTag.toLowerCase(), a.id]));
  const takenAssetTags = new Set(assets.map((a) => a.assetTag.toLowerCase()));
  const assetByName = new Map<string, string>();
  for (const a of assets) {
    const n = a.name.trim().toLowerCase();
    if (n && !assetByName.has(n)) assetByName.set(n, a.id);
  }
  const vendorByName = new Map(vendors.map((v) => [v.name.toLowerCase(), v.id]));

  const empByFull = new Map<string, string>();
  const empByFirst = new Map<string, string>();
  for (const e of employees) {
    empByFull.set(`${e.firstName} ${e.lastName}`.trim().toLowerCase(), e.id);
    const f = e.firstName.trim().toLowerCase();
    if (f && !empByFirst.has(f)) empByFirst.set(f, e.id);
  }
  const resolveEmployee = (name: string): string | null => {
    const n = name.trim().toLowerCase();
    if (!n) return null;
    return empByFull.get(n) ?? empByFirst.get(n) ?? null;
  };

  // ---- Validate & prepare rows ----
  const errors: RowError[] = [];
  const prepared: PreparedRow[] = [];

  dataRows.forEach((r, i) => {
    const rowNumber = i + 2; // header is row 1
    const rowErrors: string[] = [];

    const assetTag = cell(r, "assetTag");
    const assetName = cell(r, "assetName");
    const reference = assetTag || assetName || "-";

    const problem = cell(r, "problem");
    if (!problem) rowErrors.push("problem is required / ต้องระบุ problem");

    // Priority
    let priority: PriorityValue = "MEDIUM";
    const priorityRaw = cell(r, "priority");
    if (priorityRaw) {
      const upper = priorityRaw.toUpperCase();
      if ((PRIORITIES as readonly string[]).includes(upper)) priority = upper as PriorityValue;
      else rowErrors.push(`Invalid priority "${priorityRaw}" / ค่า priority ไม่ถูกต้อง`);
    }

    // Dates
    const startRaw = cell(r, "startedAt");
    const finishRaw = cell(r, "completedAt");
    let startedAt: Date | null = null;
    let completedAt: Date | null = null;
    if (startRaw) {
      startedAt = parseDateOnly(startRaw);
      if (!startedAt) rowErrors.push(`Invalid startedAt "${startRaw}" (YYYY-MM-DD) / วันที่เริ่มไม่ถูกต้อง`);
    }
    if (finishRaw) {
      completedAt = parseDateOnly(finishRaw);
      if (!completedAt) rowErrors.push(`Invalid completedAt "${finishRaw}" (YYYY-MM-DD) / วันที่เสร็จไม่ถูกต้อง`);
    }

    // Status — default derived: has completion date → COMPLETED, else OPEN.
    let status: StatusValue = completedAt ? "COMPLETED" : "OPEN";
    const statusRaw = cell(r, "status");
    if (statusRaw) {
      const upper = statusRaw.toUpperCase();
      if ((STATUSES as readonly string[]).includes(upper)) status = upper as StatusValue;
      else rowErrors.push(`Invalid status "${statusRaw}" / ค่า status ไม่ถูกต้อง`);
    }

    // Cost
    let repairCost: number | null = null;
    const costRaw = cell(r, "repairCost");
    if (costRaw) {
      repairCost = parseCost(costRaw);
      if (repairCost === null) rowErrors.push(`Invalid repairCost "${costRaw}" / ค่าใช้จ่ายไม่ถูกต้อง`);
    }

    // Asset resolution
    let assetId: string | null = null;
    let createAsset: { name: string } | null = null;
    if (assetTag) {
      assetId = assetByTag.get(assetTag.toLowerCase()) ?? null;
      if (!assetId) {
        rowErrors.push(`Unknown assetTag "${assetTag}" / ไม่พบ assetTag "${assetTag}" ในระบบ`);
      }
    } else if (assetName) {
      assetId = assetByName.get(assetName.toLowerCase()) ?? null;
      if (!assetId) createAsset = { name: assetName }; // auto-create a minimal asset
    } else {
      rowErrors.push("assetTag or assetName is required / ต้องระบุ assetTag หรือ assetName");
    }

    // Vendor (optional; unknown ignored)
    const vendorRaw = cell(r, "vendor");
    const vendorId = vendorRaw ? vendorByName.get(vendorRaw.toLowerCase()) ?? null : null;

    // Technician (optional; unresolved kept as note)
    const technicianName = cell(r, "technicianName");
    const technicianId = resolveEmployee(technicianName);

    // Assemble remark from free-text context that has no dedicated column.
    const remarkParts: string[] = [];
    const baseRemark = cell(r, "remark");
    if (baseRemark) remarkParts.push(baseRemark);
    const requestBy = cell(r, "requestBy");
    if (requestBy) remarkParts.push(`แจ้งโดย/Requested by: ${requestBy}`);
    const userName = cell(r, "userName");
    if (userName) remarkParts.push(`ผู้ใช้/User: ${userName}`);
    if (technicianName && !technicianId) remarkParts.push(`ช่าง/Technician: ${technicianName}`);

    if (rowErrors.length > 0) {
      errors.push({ row: rowNumber, reference, error: rowErrors.join("; ") });
      return;
    }

    prepared.push({
      rowNumber,
      reference,
      problem,
      diagnosis: cell(r, "solution") || null,
      priority,
      status,
      technicianId,
      vendorId,
      repairCost,
      startedAt,
      completedAt,
      remark: remarkParts.length > 0 ? remarkParts.join(" · ") : null,
      assetId,
      createAsset,
    });
  });

  // ---- Ticket-number allocator (unique per org, MT-{year}-{seq}) ----
  const takenNumbers = new Set(existingTickets.map((t) => t.ticketNumber));
  const yearSeq = new Map<number, number>();
  const nextTicketNumber = (year: number): string => {
    let seq = yearSeq.get(year) ?? 0;
    let candidate: string;
    do {
      seq += 1;
      candidate = `MT-${year}-${String(seq).padStart(4, "0")}`;
    } while (takenNumbers.has(candidate));
    yearSeq.set(year, seq);
    takenNumbers.add(candidate);
    return candidate;
  };

  // ---- Create everything in one transaction ----
  let created = 0;
  if (prepared.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const p of prepared) {
        let assetId = p.assetId;

        // Auto-create a minimal asset when the device name had no match.
        if (!assetId && p.createAsset) {
          const isOpen = OPEN_STATUSES.has(p.status);
          const newAsset = await tx.asset.create({
            data: {
              organizationId: user.organizationId,
              assetTag: nextAssetTag(takenAssetTags),
              name: p.createAsset.name,
              status: isOpen ? "IN_REPAIR" : "AVAILABLE",
              notes: "สร้างอัตโนมัติจากการนำเข้างานซ่อม / Auto-created from maintenance import",
            },
            select: { id: true },
          });
          assetId = newAsset.id;
          await tx.assetHistory.create({
            data: {
              organizationId: user.organizationId,
              assetId,
              action: "REGISTER",
              detail: "Auto-created from maintenance import",
              actorId: user.id,
            },
          });
        }
        if (!assetId) continue; // defensive; validation guarantees resolution

        const year =
          p.completedAt?.getUTCFullYear() ?? p.startedAt?.getUTCFullYear() ?? new Date().getUTCFullYear();

        await tx.maintenanceTicket.create({
          data: {
            organizationId: user.organizationId,
            ticketNumber: nextTicketNumber(year),
            assetId,
            problem: p.problem,
            diagnosis: p.diagnosis,
            priority: p.priority,
            status: p.status,
            technicianId: p.technicianId,
            vendorId: p.vendorId,
            repairCost: p.repairCost !== null ? p.repairCost.toString() : null,
            startedAt: p.startedAt,
            completedAt: p.completedAt,
            remark: p.remark,
          },
        });

        // Only flip a matched existing asset to IN_REPAIR for actively-open
        // tickets. Historical COMPLETED/CANCELLED rows leave the asset alone.
        if (OPEN_STATUSES.has(p.status) && p.assetId) {
          await tx.asset.update({ where: { id: p.assetId }, data: { status: "IN_REPAIR" } });
        }
        created += 1;
      }
    });
  }

  await auditLog(user, {
    action: "IMPORT",
    entityType: "MAINTENANCE_TICKET",
    detail: {
      created,
      failed: errors.length,
      fileName: file.name,
      format: sourceFormat,
    },
  });

  return NextResponse.json({
    created,
    failed: errors.length,
    errors: errors.slice(0, MAX_ERRORS_RETURNED),
  });
});

// Auto-generated asset tag for devices created from maintenance import.
// Uses a running set so a single import batch never collides with itself.
function nextAssetTag(taken: Set<string>): string {
  let n = taken.size + 1;
  let tag: string;
  do {
    tag = `MT-IMP-${String(n).padStart(4, "0")}`;
    n += 1;
  } while (taken.has(tag.toLowerCase()));
  taken.add(tag.toLowerCase());
  return tag;
}
