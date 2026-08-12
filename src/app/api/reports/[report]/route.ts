import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission, AuthError, type CurrentUser } from "@/lib/session";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const MAX_ROWS = 10_000;

type Cell = string | number | boolean | Date | null | undefined;

/** Escape a CSV cell: quote-escape and neutralize spreadsheet formula injection. */
function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else s = String(v);
  // CSV injection protection: prefix cells starting with =,+,-,@ with a single quote
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) s = '"' + s.replaceAll('"', '""') + '"';
  return s;
}

function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  // BOM so Excel opens Thai text correctly
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

interface ReportResult {
  headers: string[];
  rows: Cell[][];
}

type ReportBuilder = (user: CurrentUser) => Promise<ReportResult>;

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

export const GET = apiHandler(
  async (_req: Request, ctx: { params: Promise<{ report: string }> }) => {
    const user = await requirePermission("report:export");
    const { report } = await ctx.params;

    const builder = REPORT_BUILDERS[report];
    if (!builder) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Audit-grade reports additionally require audit:read
    if ((report === "audit" || report === "vault-access") && !user.permissions.has("audit:read")) {
      throw new AuthError("FORBIDDEN:audit:read", 403);
    }

    const { headers, rows } = await builder(user);

    await auditLog(user, {
      action: "EXPORT",
      entityType: "REPORT",
      detail: { report, rowCount: rows.length },
    });

    const filename = `${report}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(toCsv(headers, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }
);
