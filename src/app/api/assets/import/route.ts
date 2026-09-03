import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
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

const ASSET_CONDITIONS = ["NEW", "GOOD", "FAIR", "DAMAGED", "CRITICAL"] as const;
const ASSET_STATUSES = [
  "AVAILABLE",
  "ASSIGNED",
  "IN_USE",
  "IN_REPAIR",
  "LOST",
  "STOLEN",
  "DAMAGED",
  "RETIRED",
  "DISPOSED",
] as const;

type AssetConditionValue = (typeof ASSET_CONDITIONS)[number];
type AssetStatusValue = (typeof ASSET_STATUSES)[number];

const COLUMNS = [
  "assetTag",
  "name",
  "serialNumber",
  "brand",
  "model",
  "specification",
  "category",
  "department",
  "location",
  "vendor",
  "purchaseDate",
  "purchasePrice",
  "warrantyStart",
  "warrantyEnd",
  "invoiceNumber",
  "condition",
  "status",
  "costCenter",
  "project",
  "ipAddress",
  "notes",
  "assignedToName",
] as const;

type ColumnName = (typeof COLUMNS)[number];

// ------------------------------------------------------------------
// Small robust CSV parser (RFC 4180-ish): quoted fields with commas,
// doubled quotes, CRLF/LF line endings, optional UTF-8 BOM.
// ------------------------------------------------------------------

function parseCsv(input: string): string[][] {
  // Strip UTF-8 BOM if present
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
      // Treat CRLF (or a lone CR) as a row break
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
  // Flush trailing field/row (unless the file ended exactly on a newline)
  if (field.length > 0 || row.length > 0) pushRow();

  // Drop fully-empty trailing rows
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

// ------------------------------------------------------------------
// XLSX parser — first worksheet, row 1 = headers. Produces the same
// string[][] shape as parseCsv so both feed the same import pipeline.
// Returns null when the file cannot be parsed as a workbook.
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
      // cell.text normalizes dates/rich text/formula results to strings
      values.push(row.getCell(c).text ?? "");
    }
    // Skip fully-empty rows (same as the CSV parser)
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
  // Reject rollovers like 2024-02-31
  if (d.toISOString().slice(0, 10) !== v) return null;
  return d;
}

// ------------------------------------------------------------------
// GET — CSV template
// ------------------------------------------------------------------

export const GET = apiHandler(async () => {
  await requirePermission("asset:create");

  const example: Record<ColumnName, string> = {
    assetTag: "IT-NB-0001",
    name: "Dell Latitude 5440",
    serialNumber: "SN123456789",
    brand: "Dell",
    model: "Latitude 5440",
    specification: "i7-1355U, 16GB RAM, 512GB SSD",
    category: "Notebook",
    department: "IT",
    location: "HQ",
    vendor: "Dell Thailand",
    purchaseDate: "2026-01-15",
    purchasePrice: "45900.00",
    warrantyStart: "2026-01-15",
    warrantyEnd: "2029-01-14",
    invoiceNumber: "INV-2026-0001",
    condition: "NEW",
    status: "AVAILABLE",
    costCenter: "CC-1001",
    project: "Laptop Refresh 2026",
    ipAddress: "192.168.1.10",
    notes: "Imported via CSV",
    assignedToName: "Somchai Jaidee",
  };

  // BOM so Excel opens Thai text as UTF-8
  const csv =
    "\uFEFF" +
    [COLUMNS.map(esc).join(","), COLUMNS.map((c) => esc(example[c])).join(",")].join("\r\n") +
    "\r\n";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="asset-import-template.csv"',
    },
  });
});

// ------------------------------------------------------------------
// POST — bulk import
// ------------------------------------------------------------------

interface RowError {
  row: number;
  assetTag: string;
  error: string;
}

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("asset:create");

  const form = await req.formData();
  const file = form.get("file");
  // When set, an existing assetTag is NOT an error: instead, if the row carries
  // an assignedToName that resolves to an employee and the asset has no active
  // holder yet, assign it (no clobber of an existing custody).
  const assignExisting = form.get("assignExisting") === "true";
  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        error: "missing_file",
        message: "No CSV/Excel file uploaded / ไม่พบไฟล์ CSV หรือ Excel (.xlsx)",
      },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "file_too_large", message: "File exceeds 2MB limit / ไฟล์เกิน 2MB" },
      { status: 400 }
    );
  }

  // Detect input format, parse into a common string[][] shape, then run
  // the SAME validation/creation pipeline below for both formats.
  const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.type === XLSX_MIME;
  const sourceFormat = isXlsx ? "xlsx" : "csv";

  let rows: string[][];
  if (isXlsx) {
    const parsed = await parseXlsx(await file.arrayBuffer());
    if (parsed === null) {
      return NextResponse.json(
        {
          error: "invalid_file",
          message: "Could not read the .xlsx file / ไม่สามารถอ่านไฟล์ .xlsx ได้",
        },
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

  // Map header columns case-insensitively → index
  const headerRow = rows[0].map((h) => h.trim().toLowerCase());
  // Accepted header aliases → canonical column. Lets the app's own asset export
  // (which labels the holder column "assignedTo") round-trip back through import.
  const ALIASES: Partial<Record<ColumnName, string[]>> = {
    assignedToName: ["assignedto", "assigned to", "holder"],
    serialNumber: ["serial", "serialno", "serial no"],
    warrantyEnd: ["warranty end"],
    purchaseDate: ["purchase date"],
    purchasePrice: ["purchase price", "price"],
  };
  const colIndex = new Map<ColumnName, number>();
  for (const col of COLUMNS) {
    let idx = headerRow.indexOf(col.toLowerCase());
    if (idx < 0) {
      for (const alias of ALIASES[col] ?? []) {
        idx = headerRow.indexOf(alias);
        if (idx >= 0) break;
      }
    }
    if (idx >= 0) colIndex.set(col, idx);
  }
  if (!colIndex.has("assetTag") || !colIndex.has("name")) {
    return NextResponse.json(
      {
        error: "invalid_header",
        message:
          "Header row must include assetTag and name columns / แถวหัวตารางต้องมีคอลัมน์ assetTag และ name",
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

  // ---- Prefetch org data for validation (one query each) ----
  const orgWhere = { organizationId: user.organizationId, deletedAt: null };
  const [existingAssets, categories, departments, locations, vendors, employees] = await Promise.all([
    prisma.asset.findMany({
      where: orgWhere,
      select: {
        id: true,
        assetTag: true,
        assignments: { where: { status: "CHECKED_OUT" }, select: { id: true }, take: 1 },
      },
    }),
    prisma.assetCategory.findMany({ where: orgWhere, select: { id: true, name: true } }),
    prisma.department.findMany({ where: orgWhere, select: { id: true, code: true, name: true } }),
    prisma.location.findMany({ where: orgWhere, select: { id: true, code: true, name: true } }),
    prisma.vendor.findMany({ where: orgWhere, select: { id: true, name: true } }),
    prisma.employee.findMany({ where: orgWhere, select: { id: true, firstName: true, lastName: true } }),
  ]);

  // Match an asset's holder (assignedToName) to an employee by full name or first name.
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
  // assetTag(lower) -> employeeId for CHECKED_OUT assignment after asset creation
  const assignByTag = new Map<string, string>();

  const existingByTag = new Map(
    existingAssets.map((a) => [a.assetTag.toLowerCase(), { id: a.id, assigned: a.assignments.length > 0 }])
  );
  const existingTags = new Set(existingByTag.keys());
  // Existing assets to (re)assign a holder to, gathered during row validation.
  const assignExistingList: { assetId: string; empId: string }[] = [];
  let skippedExistingAssigned = 0; // existing + already has a holder → left untouched
  let skippedExistingNoHolder = 0; // existing + no resolvable holder in the row
  // category / department / location resolve by NAME and are AUTO-CREATED when
  // missing (bulk-import friendly, consistent with the employee importer).
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const departmentByName = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));
  const locationByName = new Map(locations.map((l) => [l.name.toLowerCase(), l.id]));
  const vendorByName = new Map(vendors.map((v) => [v.name.toLowerCase(), v.id]));
  const deptCodes = new Set(departments.map((d) => d.code.toUpperCase()));
  const locCodes = new Set(locations.map((l) => l.code.toUpperCase()));

  const uniqueCode = (name: string, prefix: string, taken: Set<string>) => {
    const base =
      name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) ||
      `${prefix}${Math.abs([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 100000}`;
    let code = base, n = 1;
    while (taken.has(code.toUpperCase())) code = `${base.slice(0, 14)}-${++n}`;
    taken.add(code.toUpperCase());
    return code;
  };

  // Pre-create any category / department / location referenced by name but not
  // yet present, so the per-row lookups below always resolve.
  const wantCat = new Set<string>(), wantDept = new Set<string>(), wantLoc = new Set<string>();
  for (const r of dataRows) {
    const c = cell(r, "category"); if (c && !categoryByName.has(c.toLowerCase())) wantCat.add(c);
    const d = cell(r, "department"); if (d && !departmentByName.has(d.toLowerCase())) wantDept.add(d);
    const l = cell(r, "location"); if (l && !locationByName.has(l.toLowerCase())) wantLoc.add(l);
  }
  for (const name of wantCat) {
    const c = await prisma.assetCategory.create({ data: { organizationId: user.organizationId, name } });
    categoryByName.set(name.toLowerCase(), c.id);
  }
  for (const name of wantDept) {
    const d = await prisma.department.create({ data: { organizationId: user.organizationId, name, code: uniqueCode(name, "DEPT", deptCodes) } });
    departmentByName.set(name.toLowerCase(), d.id);
  }
  for (const name of wantLoc) {
    const l = await prisma.location.create({ data: { organizationId: user.organizationId, name, code: uniqueCode(name, "LOC", locCodes) } });
    locationByName.set(name.toLowerCase(), l.id);
  }

  // ---- Validate rows ----
  const errors: RowError[] = [];
  const validRows: Prisma.AssetCreateManyInput[] = [];
  const seenTags = new Set<string>();

  dataRows.forEach((r, i) => {
    const rowNumber = i + 2; // header is row 1
    const assetTag = cell(r, "assetTag");
    const rowErrors: string[] = [];

    // assetTag
    if (!assetTag) {
      rowErrors.push("assetTag is required / ต้องระบุ assetTag");
    } else if (seenTags.has(assetTag.toLowerCase())) {
      rowErrors.push("Duplicate assetTag within file / assetTag ซ้ำกันในไฟล์");
    } else if (existingTags.has(assetTag.toLowerCase())) {
      if (!assignExisting) {
        rowErrors.push("assetTag already exists / assetTag มีอยู่แล้วในระบบ");
      } else {
        // Existing asset: assign its holder from assignedToName instead of
        // erroring — but never clobber an asset that already has one.
        const ex = existingByTag.get(assetTag.toLowerCase())!;
        const empId = resolveEmployee(cell(r, "assignedToName"));
        if (ex.assigned) skippedExistingAssigned++;
        else if (!empId) skippedExistingNoHolder++;
        else if (!assignExistingList.some((a) => a.assetId === ex.id)) {
          assignExistingList.push({ assetId: ex.id, empId });
        }
        return; // handled as an assignment, not a new asset
      }
    }

    // name
    const name = cell(r, "name");
    if (!name) rowErrors.push("name is required / ต้องระบุ name");

    // Enums
    const conditionRaw = cell(r, "condition");
    let condition: AssetConditionValue = "GOOD";
    if (conditionRaw) {
      const upper = conditionRaw.toUpperCase();
      if ((ASSET_CONDITIONS as readonly string[]).includes(upper)) {
        condition = upper as AssetConditionValue;
      } else {
        rowErrors.push(`Invalid condition "${conditionRaw}" / ค่า condition ไม่ถูกต้อง`);
      }
    }

    const statusRaw = cell(r, "status");
    let status: AssetStatusValue = "AVAILABLE";
    if (statusRaw) {
      const upper = statusRaw.toUpperCase();
      if ((ASSET_STATUSES as readonly string[]).includes(upper)) {
        status = upper as AssetStatusValue;
      } else {
        rowErrors.push(`Invalid status "${statusRaw}" / ค่า status ไม่ถูกต้อง`);
      }
    }

    // Dates
    const dates: Partial<Record<"purchaseDate" | "warrantyStart" | "warrantyEnd", Date>> = {};
    for (const dc of ["purchaseDate", "warrantyStart", "warrantyEnd"] as const) {
      const v = cell(r, dc);
      if (!v) continue;
      const parsed = parseDateOnly(v);
      if (parsed) {
        dates[dc] = parsed;
      } else {
        rowErrors.push(`Invalid ${dc} "${v}" (expected YYYY-MM-DD) / รูปแบบวันที่ ${dc} ไม่ถูกต้อง`);
      }
    }

    // Price
    const priceRaw = cell(r, "purchasePrice");
    let purchasePrice: string | undefined;
    if (priceRaw) {
      const num = Number(priceRaw);
      if (Number.isFinite(num) && num >= 0) {
        purchasePrice = priceRaw;
      } else {
        rowErrors.push(`Invalid purchasePrice "${priceRaw}" / ราคาซื้อไม่ถูกต้อง`);
      }
    }

    // Lookups (do NOT auto-create)
    const lookup = (
      col: ColumnName,
      map: Map<string, string>,
      label: string
    ): string | undefined => {
      const v = cell(r, col);
      if (!v) return undefined;
      const id = map.get(v.toLowerCase());
      if (!id) {
        rowErrors.push(`Unknown ${label} "${v}" / ไม่พบ${label} "${v}" ในระบบ`);
        return undefined;
      }
      return id;
    };
    const categoryId = lookup("category", categoryByName, "category");
    const departmentId = lookup("department", departmentByName, "department");
    const locationId = lookup("location", locationByName, "location");
    // Vendor is optional and NOT auto-created — unknown vendor is ignored, not an error.
    const vendorRaw = cell(r, "vendor");
    const vendorId = vendorRaw ? vendorByName.get(vendorRaw.toLowerCase()) : undefined;

    if (rowErrors.length > 0) {
      errors.push({ row: rowNumber, assetTag, error: rowErrors.join("; ") });
      return;
    }

    seenTags.add(assetTag.toLowerCase());
    const holderEmpId = resolveEmployee(cell(r, "assignedToName"));
    if (holderEmpId) assignByTag.set(assetTag.toLowerCase(), holderEmpId);
    validRows.push({
      organizationId: user.organizationId,
      assetTag,
      name,
      serialNumber: cell(r, "serialNumber") || null,
      brand: cell(r, "brand") || null,
      model: cell(r, "model") || null,
      specification: cell(r, "specification") || null,
      categoryId: categoryId ?? null,
      departmentId: departmentId ?? null,
      locationId: locationId ?? null,
      vendorId: vendorId ?? null,
      purchaseDate: dates.purchaseDate ?? null,
      purchasePrice: purchasePrice ?? null,
      warrantyStart: dates.warrantyStart ?? null,
      warrantyEnd: dates.warrantyEnd ?? null,
      invoiceNumber: cell(r, "invoiceNumber") || null,
      condition,
      status,
      costCenter: cell(r, "costCenter") || null,
      project: cell(r, "project") || null,
      ipAddress: cell(r, "ipAddress") || null,
      notes: cell(r, "notes") || null,
    });
  });

  // ---- Create valid rows in one transaction ----
  if (validRows.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.asset.createMany({ data: validRows });
      const created = await tx.asset.findMany({
        where: {
          organizationId: user.organizationId,
          deletedAt: null,
          assetTag: { in: validRows.map((v) => v.assetTag) },
        },
        select: { id: true, assetTag: true },
      });
      await tx.assetHistory.createMany({
        data: created.map((a) => ({
          organizationId: user.organizationId,
          assetId: a.id,
          action: "REGISTER",
          detail: isXlsx ? "XLSX import" : "CSV import",
          actorId: user.id,
        })),
      });
      // Link assets to their holder (assignedToName → employee) as an
      // active CHECKED_OUT assignment, and mark the asset IN_USE.
      const assignments = created
        .map((a) => ({ a, empId: assignByTag.get(a.assetTag.toLowerCase()) }))
        .filter((x): x is { a: typeof x.a; empId: string } => !!x.empId);
      if (assignments.length > 0) {
        await tx.assetAssignment.createMany({
          data: assignments.map(({ a, empId }) => ({
            organizationId: user.organizationId,
            assetId: a.id,
            employeeId: empId,
            status: "CHECKED_OUT" as const,
            assignedById: user.id,
            purpose: "Bulk import",
          })),
        });
        await tx.asset.updateMany({
          where: { id: { in: assignments.map(({ a }) => a.id) } },
          data: { status: "IN_USE" },
        });
      }
    });
  }

  // ---- Assign holders to pre-existing assets (assignExisting mode) ----
  if (assignExistingList.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.assetAssignment.createMany({
        data: assignExistingList.map(({ assetId, empId }) => ({
          organizationId: user.organizationId,
          assetId,
          employeeId: empId,
          status: "CHECKED_OUT" as const,
          assignedById: user.id,
          purpose: "Bulk import (assign existing)",
        })),
      });
      await tx.asset.updateMany({
        where: { id: { in: assignExistingList.map((a) => a.assetId) } },
        data: { status: "IN_USE" },
      });
      await tx.assetHistory.createMany({
        data: assignExistingList.map(({ assetId }) => ({
          organizationId: user.organizationId,
          assetId,
          action: "ASSIGN",
          detail: "Bulk import — assigned existing asset",
          actorId: user.id,
        })),
      });
    });
  }

  await auditLog(user, {
    action: "IMPORT",
    entityType: "ASSET",
    detail: {
      created: validRows.length,
      failed: errors.length,
      assignedExisting: assignExistingList.length,
      fileName: file.name,
      format: sourceFormat,
    },
  });

  return NextResponse.json({
    created: validRows.length,
    failed: errors.length,
    assignedExisting: assignExistingList.length,
    skippedExistingAssigned,
    skippedExistingNoHolder,
    errors: errors.slice(0, MAX_ERRORS_RETURNED),
  });
});
