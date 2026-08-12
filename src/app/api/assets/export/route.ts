import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

/** CSV-escape a value: wrap in quotes, double any inner quotes. */
function esc(v: unknown): string {
  if (v === null || v === undefined) return '""';
  return `"${String(v).replaceAll('"', '""')}"`;
}

function dateOnly(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export const GET = apiHandler(async () => {
  const user = await requirePermission("asset:export");

  const assets = await prisma.asset.findMany({
    where: { organizationId: user.organizationId, deletedAt: null },
    orderBy: { assetTag: "asc" },
    include: {
      category: { select: { name: true } },
      department: { select: { name: true } },
      location: { select: { name: true } },
      assignments: {
        where: { status: "CHECKED_OUT" },
        orderBy: { assignedAt: "desc" },
        take: 1,
        select: { employee: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  const header = [
    "assetTag",
    "name",
    "serialNumber",
    "category",
    "status",
    "condition",
    "department",
    "location",
    "assignedTo",
    "purchaseDate",
    "purchasePrice",
    "warrantyEnd",
  ];
  const rows = assets.map((a) => {
    const holder = a.assignments[0]?.employee;
    return [
      esc(a.assetTag),
      esc(a.name),
      esc(a.serialNumber ?? ""),
      esc(a.category?.name ?? ""),
      esc(a.status),
      esc(a.condition),
      esc(a.department?.name ?? ""),
      esc(a.location?.name ?? ""),
      esc(holder ? `${holder.firstName} ${holder.lastName}` : ""),
      esc(dateOnly(a.purchaseDate)),
      esc(a.purchasePrice != null ? Number(a.purchasePrice).toFixed(2) : ""),
      esc(dateOnly(a.warrantyEnd)),
    ].join(",");
  });
  // BOM so Excel opens Thai text as UTF-8
  const csv = "\uFEFF" + [header.map(esc).join(","), ...rows].join("\r\n") + "\r\n";

  await auditLog(user, {
    action: "EXPORT",
    entityType: "ASSET",
    detail: { count: assets.length, format: "csv" },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="assets.csv"',
    },
  });
});
