import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission, AuthError, type CurrentUser } from "@/lib/session";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MAX_ROWS = 10_000;
const MAX_PDF_ROWS = 1_000;

type Cell = string | number | boolean | Date | null | undefined;

/** Normalized cell value shared by all serializers. */
type Value = string | number | null;

interface ReportData {
  title: string;
  columns: string[];
  rows: Value[][];
}

/** Normalize raw query cells once; every format serializes from this shape. */
function normalizeCell(v: Cell): Value {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") return v;
  return String(v);
}

// ------------------------------------------------------------------
// CSV
// ------------------------------------------------------------------

/** Escape a CSV cell: quote-escape and neutralize spreadsheet formula injection. */
function csvCell(v: Value): string {
  if (v === null) return "";
  let s = String(v);
  // CSV injection protection: prefix cells starting with =,+,-,@ with a single quote
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replaceAll('"', '""') + '"';
  return s;
}

function toCsv(data: ReportData): string {
  const lines = [
    data.columns.map(csvCell).join(","),
    ...data.rows.map((r) => r.map(csvCell).join(",")),
  ];
  // BOM so Excel opens Thai text correctly
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

// ------------------------------------------------------------------
// XLSX
// ------------------------------------------------------------------

async function toXlsx(report: string, data: ReportData): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(report);

  // Width auto-ish from header length (min 12, max 40)
  worksheet.columns = data.columns.map((h) => ({
    header: h,
    width: Math.min(40, Math.max(12, h.length + 4)),
  }));

  // Assign cell values directly (never {formula}) — exceljs writes plain
  // strings/numbers, so formula injection is not possible here.
  for (const row of data.rows) {
    worksheet.addRow(row);
  }

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
  });
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  return workbook.xlsx.writeBuffer();
}

// ------------------------------------------------------------------
// PDF
// ------------------------------------------------------------------

function loadThaiFont(): Buffer | null {
  // process.cwd()-relative read so the font is served from the app bundle.
  try {
    return fs.readFileSync(
      path.join(process.cwd(), "src/assets/fonts/NotoSansThai-Regular.ttf")
    );
  } catch {
    return null;
  }
}

function truncateToWidth(doc: PDFKit.PDFDocument, text: string, maxWidth: number): string {
  let s = text.length > 60 ? text.slice(0, 60) : text;
  if (doc.widthOfString(s) <= maxWidth) return s;
  while (s.length > 0 && doc.widthOfString(s + "…") > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + "…";
}

function toPdf(data: ReportData, fontData: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const margin = 36;
    // font: "" prevents pdfkit from initializing built-in Helvetica, whose
    // .afm metric files are not traced into the Next standalone bundle.
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin, font: "" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Thai-capable font used for ALL text
    doc.registerFont("thai", fontData);
    doc.font("thai");

    const pageWidth = doc.page.width - margin * 2;
    const bottom = doc.page.height - margin;
    const colWidth = pageWidth / data.columns.length;
    const headerHeight = 18;
    const rowHeight = 14;

    const drawTableHeader = (y: number): number => {
      doc.rect(margin, y, pageWidth, headerHeight).fill("#e5e7eb");
      doc.fillColor("#111827").fontSize(10);
      data.columns.forEach((col, i) => {
        doc.text(truncateToWidth(doc, col, colWidth - 6), margin + i * colWidth + 3, y + 4, {
          width: colWidth - 6,
          lineBreak: false,
        });
      });
      return y + headerHeight + 2;
    };

    // Title + generated timestamp
    doc.fillColor("#111827").fontSize(14);
    doc.text(data.title, margin, margin, { width: pageWidth, lineBreak: false });
    doc.fontSize(9).fillColor("#6b7280");
    doc.text(`Generated ${new Date().toISOString()}`, margin, margin + 20, {
      width: pageWidth,
      lineBreak: false,
    });

    let y = drawTableHeader(margin + 38);
    const rows = data.rows.slice(0, MAX_PDF_ROWS);

    doc.fontSize(9);
    for (const row of rows) {
      if (y + rowHeight > bottom) {
        doc.addPage();
        y = drawTableHeader(margin);
        doc.fontSize(9);
      }
      doc.fillColor("#111827");
      row.forEach((cell, i) => {
        const text = cell === null ? "" : String(cell);
        if (!text) return;
        doc.text(truncateToWidth(doc, text, colWidth - 6), margin + i * colWidth + 3, y, {
          width: colWidth - 6,
          lineBreak: false,
        });
      });
      y += rowHeight;
      doc
        .moveTo(margin, y - 3)
        .lineTo(margin + pageWidth, y - 3)
        .lineWidth(0.5)
        .strokeColor("#d1d5db")
        .stroke();
    }

    if (data.rows.length > MAX_PDF_ROWS) {
      if (y + rowHeight > bottom) {
        doc.addPage();
        y = margin;
      }
      doc.fillColor("#6b7280").fontSize(9);
      doc.text("... (truncated, use CSV/XLSX for full data)", margin, y + 4, {
        width: pageWidth,
        lineBreak: false,
      });
    }

    doc.end();
  });
}

// ------------------------------------------------------------------
// Report builders (queries unchanged)
// ------------------------------------------------------------------

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

interface ReportResult {
  headers: string[];
  rows: Cell[][];
}

type ReportBuilder = (user: CurrentUser) => Promise<ReportResult>;

const REPORT_TITLES: Record<string, string> = {
  assets: "ทะเบียนทรัพย์สิน / Asset Inventory",
  "assets-by-department": "ทรัพย์สินตามแผนก / Assets by Department",
  assignments: "การเบิก-คืนทรัพย์สิน / Asset Assignments",
  maintenance: "งานซ่อมบำรุง / Maintenance",
  warranty: "การรับประกัน / Warranty",
  licenses: "ไลเซนส์ซอฟต์แวร์ / Licenses",
  subscriptions: "บริการสมาชิก / Subscriptions",
  purchases: "การจัดซื้อ / Purchases",
  audit: "บันทึกตรวจสอบ / Audit Log",
  "vault-access": "การเข้าถึง Vault / Vault Access",
  "borrow-requests": "คำขอยืมทรัพย์สิน / Borrow Requests",
  "borrow-overdue": "รายการเกินกำหนดคืน / Overdue Loans",
  "borrow-utilization": "อัตราการใช้งานทรัพย์สิน / Asset Borrow Utilization",
};

const REPORT_BUILDERS: Record<string, ReportBuilder> = {
  assets: async (user) => {
    const assets = await prisma.asset.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: {
        assetTag: true,
        serialNumber: true,
        name: true,
        brand: true,
        model: true,
        status: true,
        condition: true,
        purchaseDate: true,
        purchasePrice: true,
        currentValue: true,
        warrantyEnd: true,
        costCenter: true,
        category: { select: { name: true } },
        department: { select: { name: true } },
        location: { select: { name: true } },
        vendor: { select: { name: true } },
      },
      orderBy: { assetTag: "asc" },
      take: MAX_ROWS,
    });
    return {
      headers: [
        "Asset Tag", "Serial Number", "Name", "Brand", "Model", "Category", "Department",
        "Location", "Vendor", "Status", "Condition", "Purchase Date", "Purchase Price",
        "Current Value", "Warranty End", "Cost Center",
      ],
      rows: assets.map((a) => [
        a.assetTag, a.serialNumber, a.name, a.brand, a.model, a.category?.name,
        a.department?.name, a.location?.name, a.vendor?.name, a.status, a.condition,
        a.purchaseDate, num(a.purchasePrice), num(a.currentValue), a.warrantyEnd, a.costCenter,
      ]),
    };
  },

  "assets-by-department": async (user) => {
    const groups = await prisma.asset.groupBy({
      by: ["departmentId", "status"],
      _count: true,
      where: { organizationId: user.organizationId, deletedAt: null },
    });
    const deptIds = [...new Set(groups.map((g) => g.departmentId).filter((v): v is string => !!v))];
    const departments = deptIds.length
      ? await prisma.department.findMany({
          where: { id: { in: deptIds } },
          select: { id: true, code: true, name: true },
        })
      : [];
    const deptMap = new Map(departments.map((d) => [d.id, d]));
    return {
      headers: ["Department Code", "Department", "Status", "Asset Count"],
      rows: groups
        .slice(0, MAX_ROWS)
        .map((g) => {
          const d = g.departmentId ? deptMap.get(g.departmentId) : undefined;
          return [d?.code ?? "", d?.name ?? "Unspecified", g.status, g._count] as Cell[];
        })
        .sort((a, b) => String(a[1]).localeCompare(String(b[1]))),
    };
  },

  assignments: async (user) => {
    const rows = await prisma.assetAssignment.findMany({
      where: { organizationId: user.organizationId },
      select: {
        status: true,
        assignedAt: true,
        expectedReturnDate: true,
        returnedAt: true,
        purpose: true,
        conditionBefore: true,
        conditionAfter: true,
        asset: { select: { assetTag: true, name: true } },
        employee: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
      orderBy: { assignedAt: "desc" },
      take: MAX_ROWS,
    });
    return {
      headers: [
        "Asset Tag", "Asset Name", "Employee Code", "Employee", "Status", "Assigned At",
        "Expected Return", "Returned At", "Condition Before", "Condition After", "Purpose",
      ],
      rows: rows.map((r) => [
        r.asset.assetTag, r.asset.name, r.employee.employeeCode,
        `${r.employee.firstName} ${r.employee.lastName}`, r.status, r.assignedAt,
        r.expectedReturnDate, r.returnedAt, r.conditionBefore, r.conditionAfter, r.purpose,
      ]),
    };
  },

  maintenance: async (user) => {
    const rows = await prisma.maintenanceTicket.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: {
        ticketNumber: true,
        problem: true,
        priority: true,
        status: true,
        diagnosis: true,
        repairCost: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        asset: { select: { assetTag: true, name: true } },
        vendor: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });
    return {
      headers: [
        "Ticket Number", "Asset Tag", "Asset Name", "Problem", "Priority", "Status",
        "Diagnosis", "Repair Cost", "Vendor", "Created At", "Started At", "Completed At",
      ],
      rows: rows.map((r) => [
        r.ticketNumber, r.asset.assetTag, r.asset.name, r.problem, r.priority, r.status,
        r.diagnosis, num(r.repairCost), r.vendor?.name, r.createdAt, r.startedAt, r.completedAt,
      ]),
    };
  },

  warranty: async (user) => {
    const now = new Date();
    const in90d = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const rows = await prisma.asset.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        warrantyEnd: { gte: now, lte: in90d },
      },
      select: {
        assetTag: true,
        name: true,
        serialNumber: true,
        status: true,
        warrantyStart: true,
        warrantyEnd: true,
        vendor: { select: { name: true } },
      },
      orderBy: { warrantyEnd: "asc" },
      take: MAX_ROWS,
    });
    return {
      headers: [
        "Asset Tag", "Name", "Serial Number", "Status", "Vendor",
        "Warranty Start", "Warranty End", "Days Left",
      ],
      rows: rows.map((r) => [
        r.assetTag, r.name, r.serialNumber, r.status, r.vendor?.name, r.warrantyStart,
        r.warrantyEnd,
        r.warrantyEnd
          ? Math.ceil((r.warrantyEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          : null,
      ]),
    };
  },

  licenses: async (user) => {
    // License keys are encrypted fields and are intentionally never selected.
    const rows = await prisma.license.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: {
        softwareName: true,
        licenseType: true,
        totalSeats: true,
        purchaseDate: true,
        startDate: true,
        expiresAt: true,
        cost: true,
        renewalCost: true,
        autoRenewal: true,
        vendor: { select: { name: true } },
        _count: { select: { assignments: { where: { revokedAt: null } } } },
      },
      orderBy: { softwareName: "asc" },
      take: MAX_ROWS,
    });
    return {
      headers: [
        "Software", "Type", "Vendor", "Total Seats", "Seats In Use", "Purchase Date",
        "Start Date", "Expires At", "Cost", "Renewal Cost", "Auto Renewal",
      ],
      rows: rows.map((r) => [
        r.softwareName, r.licenseType, r.vendor?.name, r.totalSeats, r._count.assignments,
        r.purchaseDate, r.startDate, r.expiresAt, num(r.cost), num(r.renewalCost), r.autoRenewal,
      ]),
    };
  },

  subscriptions: async (user) => {
    const rows = await prisma.subscription.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: {
        serviceName: true,
        plan: true,
        quantity: true,
        cost: true,
        billingCycle: true,
        startDate: true,
        renewalDate: true,
        status: true,
        vendor: { select: { name: true } },
      },
      orderBy: { serviceName: "asc" },
      take: MAX_ROWS,
    });
    return {
      headers: [
        "Service", "Plan", "Vendor", "Quantity", "Cost", "Billing Cycle",
        "Start Date", "Renewal Date", "Status",
      ],
      rows: rows.map((r) => [
        r.serviceName, r.plan, r.vendor?.name, r.quantity, num(r.cost), r.billingCycle,
        r.startDate, r.renewalDate, r.status,
      ]),
    };
  },

  purchases: async (user) => {
    const rows = await prisma.purchaseRequest.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: {
        requestNumber: true,
        status: true,
        reason: true,
        totalEstimated: true,
        createdAt: true,
        department: { select: { name: true } },
        vendor: { select: { name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });
    return {
      headers: [
        "Request Number", "Status", "Department", "Vendor", "Items",
        "Total Estimated", "Reason", "Created At",
      ],
      rows: rows.map((r) => [
        r.requestNumber, r.status, r.department?.name, r.vendor?.name, r._count.items,
        num(r.totalEstimated), r.reason, r.createdAt,
      ]),
    };
  },

  audit: async (user) => {
    const rows = await prisma.auditLog.findMany({
      where: { organizationId: user.organizationId },
      select: {
        createdAt: true,
        action: true,
        entityType: true,
        entityId: true,
        result: true,
        ip: true,
        detail: true,
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });
    return {
      headers: ["Time", "User", "Email", "Action", "Entity Type", "Entity ID", "Result", "IP", "Detail"],
      rows: rows.map((r) => [
        r.createdAt, r.user?.name, r.user?.email, r.action, r.entityType, r.entityId,
        r.result, r.ip, r.detail === null ? "" : JSON.stringify(r.detail),
      ]),
    };
  },

  "borrow-requests": async (user) => {
    const rows = await prisma.borrowRequest.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: {
        refNo: true, status: true, requesterName: true, borrowDate: true, dueDate: true,
        issuedAt: true, returnedAt: true, purpose: true, createdAt: true,
        department: { select: { name: true } },
        requester: { select: { employeeCode: true, firstName: true, lastName: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });
    return {
      headers: [
        "Ref No", "Status", "Employee Code", "Requester", "Department", "Items",
        "Borrow Date", "Due Date", "Issued At", "Returned At", "Purpose", "Created At",
      ],
      rows: rows.map((r) => [
        r.refNo, r.status, r.requester.employeeCode,
        r.requesterName ?? `${r.requester.firstName} ${r.requester.lastName}`,
        r.department?.name, r._count.items, r.borrowDate, r.dueDate, r.issuedAt,
        r.returnedAt, r.purpose, r.createdAt,
      ]),
    };
  },

  "borrow-overdue": async (user) => {
    const now = new Date();
    const rows = await prisma.borrowRequest.findMany({
      where: {
        organizationId: user.organizationId, deletedAt: null,
        status: { in: ["ISSUED", "PARTIALLY_RETURNED"] },
        dueDate: { lt: now },
      },
      select: {
        refNo: true, status: true, requesterName: true, requesterPhone: true,
        dueDate: true, issuedAt: true,
        department: { select: { name: true } },
        requester: { select: { employeeCode: true, firstName: true, lastName: true } },
        items: { select: { asset: { select: { assetTag: true, name: true } }, status: true } },
      },
      orderBy: { dueDate: "asc" },
      take: MAX_ROWS,
    });
    return {
      headers: [
        "Ref No", "Employee Code", "Requester", "Phone", "Department", "Due Date",
        "Days Overdue", "Assets Out", "Asset Tags",
      ],
      rows: rows.map((r) => {
        const daysOverdue = r.dueDate
          ? Math.floor((now.getTime() - r.dueDate.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        const out = r.items.filter((i) => i.status === "ISSUED");
        return [
          r.refNo, r.requester.employeeCode,
          r.requesterName ?? `${r.requester.firstName} ${r.requester.lastName}`,
          r.requesterPhone, r.department?.name, r.dueDate, daysOverdue,
          out.length, out.map((i) => i.asset.assetTag).join(", "),
        ] as Cell[];
      }),
    };
  },

  "borrow-utilization": async (user) => {
    const grouped = await prisma.borrowRequestItem.groupBy({
      by: ["assetId"],
      where: { organizationId: user.organizationId },
      _count: true,
    });
    const assetIds = grouped.map((g) => g.assetId);
    const assets = assetIds.length
      ? await prisma.asset.findMany({
          where: { id: { in: assetIds } },
          select: { id: true, assetTag: true, name: true, status: true, category: { select: { name: true } } },
        })
      : [];
    const map = new Map(assets.map((a) => [a.id, a]));
    // Currently-out count per asset (items still ISSUED)
    const outNow = await prisma.borrowRequestItem.groupBy({
      by: ["assetId"],
      where: { organizationId: user.organizationId, status: "ISSUED" },
      _count: true,
    });
    const outMap = new Map(outNow.map((g) => [g.assetId, g._count]));
    return {
      headers: ["Asset Tag", "Asset Name", "Category", "Current Status", "Times Borrowed", "Currently Out"],
      rows: grouped
        .map((g) => {
          const a = map.get(g.assetId);
          return [
            a?.assetTag ?? "", a?.name ?? "", a?.category?.name ?? "", a?.status ?? "",
            g._count, outMap.get(g.assetId) ?? 0,
          ] as Cell[];
        })
        .sort((a, b) => Number(b[4]) - Number(a[4]))
        .slice(0, MAX_ROWS),
    };
  },

  "vault-access": async (user) => {
    // Metadata only: item name, user, action, result, ip, time — NEVER secret values.
    const rows = await prisma.vaultAccessLog.findMany({
      where: { organizationId: user.organizationId },
      select: {
        createdAt: true,
        action: true,
        result: true,
        reason: true,
        ip: true,
        userId: true,
        vaultItem: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    });
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    return {
      headers: ["Time", "Vault Item", "User", "Email", "Action", "Result", "Reason", "IP"],
      rows: rows.map((r) => {
        const u = userMap.get(r.userId);
        return [
          r.createdAt, r.vaultItem.name, u?.name, u?.email, r.action, r.result, r.reason, r.ip,
        ] as Cell[];
      }),
    };
  },
};

// ------------------------------------------------------------------
// GET — ?format=csv|xlsx|pdf (default csv)
// ------------------------------------------------------------------

const FORMATS = ["csv", "xlsx", "pdf"] as const;
type Format = (typeof FORMATS)[number];

export const GET = apiHandler(
  async (req: Request, ctx: { params: Promise<{ report: string }> }) => {
    const user = await requirePermission("report:export");
    const { report } = await ctx.params;

    const format = (new URL(req.url).searchParams.get("format") ?? "csv") as Format;
    if (!FORMATS.includes(format)) {
      return NextResponse.json({ error: "invalid_format" }, { status: 400 });
    }

    const builder = REPORT_BUILDERS[report];
    if (!builder) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Audit-grade reports additionally require audit:read
    if ((report === "audit" || report === "vault-access") && !user.permissions.has("audit:read")) {
      throw new AuthError("FORBIDDEN:audit:read", 403);
    }

    const { headers, rows } = await builder(user);
    const data: ReportData = {
      title: REPORT_TITLES[report] ?? report,
      columns: headers,
      rows: rows.map((r) => r.map(normalizeCell)),
    };

    // For PDF, resolve the font before doing anything irreversible.
    let fontData: Buffer | null = null;
    if (format === "pdf") {
      fontData = loadThaiFont();
      if (!fontData) {
        return NextResponse.json({ error: "pdf_font_missing" }, { status: 501 });
      }
    }

    await auditLog(user, {
      action: "EXPORT",
      entityType: "REPORT",
      detail: { report, format, rowCount: data.rows.length },
    });

    const filename = `${report}-${new Date().toISOString().slice(0, 10)}.${format}`;
    const commonHeaders = {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    };

    if (format === "xlsx") {
      const buffer = await toXlsx(report, data);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          ...commonHeaders,
        },
      });
    }

    if (format === "pdf") {
      const buffer = await toPdf(data, fontData as Buffer);
      return new NextResponse(new Uint8Array(buffer), {
        headers: { "Content-Type": "application/pdf", ...commonHeaders },
      });
    }

    return new NextResponse(toCsv(data), {
      headers: { "Content-Type": "text/csv; charset=utf-8", ...commonHeaders },
    });
  }
);
