import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const STATUSES = ["ACTIVE", "UNUSED", "SUSPENDED", "TERMINATED"] as const;

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replaceAll('"', '""')}"`;
}

/** GET /api/sim/export — CSV of SIM lines honouring the list's q/carrier/status filters. */
export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("sim:read");
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() || undefined;
  const carrier = sp.get("carrier") || undefined;
  const statusParam = sp.get("status");
  const status = STATUSES.includes(statusParam as (typeof STATUSES)[number]) ? (statusParam as (typeof STATUSES)[number]) : undefined;

  const where: Prisma.SimCardWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(carrier ? { carrier } : {}),
    ...(status ? { status } : {}),
    ...(q ? { OR: [
      { phoneNumber: { contains: q, mode: "insensitive" } },
      { holder: { contains: q, mode: "insensitive" } },
      { accountName: { contains: q, mode: "insensitive" } },
      { simSerial: { contains: q, mode: "insensitive" } },
    ] } : {}),
  };

  const rows = await prisma.simCard.findMany({
    where,
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } }, department: { select: { name: true } } },
    orderBy: [{ carrier: "asc" }, { phoneNumber: "asc" }],
    take: 10000,
  });

  const headers = [
    "phoneNumber", "carrier", "accountName", "holder", "employee", "employeeCode",
    "department", "status", "simSerial", "plan", "monthlyFee", "startDate", "notes",
  ];
  const lines = [headers.map(csvCell).join(",")];
  for (const s of rows) {
    lines.push([
      s.phoneNumber, s.carrier, s.accountName ?? "", s.holder ?? "",
      s.employee ? `${s.employee.firstName} ${s.employee.lastName}` : "",
      s.employee?.employeeCode ?? "",
      s.department?.name ?? "", s.status, s.simSerial ?? "", s.plan ?? "",
      s.monthlyFee != null ? String(s.monthlyFee) : "",
      s.startDate ? s.startDate.toISOString().slice(0, 10) : "",
      s.notes ?? "",
    ].map(csvCell).join(","));
  }

  await auditLog(user, { action: "EXPORT", entityType: "SIM", detail: { count: rows.length } });

  const body = "﻿" + lines.join("\r\n") + "\r\n"; // BOM for Excel/Thai
  const filename = `sim-lines-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
