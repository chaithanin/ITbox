import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { apiHandler } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_PART",
  "WAITING_VENDOR",
  "COMPLETED",
  "CANCELLED",
] as const;

export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("maintenance:read");
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));
  const q = sp.get("q")?.trim() || undefined;
  const status = STATUSES.find((s) => s === sp.get("status"));

  const where = {
    organizationId: user.organizationId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { ticketNumber: { contains: q, mode: "insensitive" as const } },
            { problem: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.maintenanceTicket.findMany({
      where,
      include: { asset: { select: { id: true, assetTag: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.maintenanceTicket.count({ where }),
  ]);

  return NextResponse.json({
    data,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total,
  });
});

const createSchema = z.object({
  assetId: z.string().min(1),
  problem: z.string().min(1).max(5000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
  technicianId: z.string().nullish(),
  vendorId: z.string().nullish(),
  remark: z.string().max(2000).nullish(),
});

export const POST = apiHandler(async (req: Request) => {
  const user = await requirePermission("maintenance:manage");
  const input = createSchema.parse(await req.json());

  const asset = await prisma.asset.findFirst({
    where: {
      id: input.assetId,
      organizationId: user.organizationId,
      deletedAt: null,
      status: { not: "DISPOSED" },
    },
    select: { id: true, assetTag: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "asset_not_found" }, { status: 404 });
  }

  let technicianId: string | null = null;
  if (input.technicianId) {
    const technician = await prisma.employee.findFirst({
      where: { id: input.technicianId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    technicianId = technician?.id ?? null;
  }
  let vendorId: string | null = null;
  if (input.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    vendorId = vendor?.id ?? null;
  }

  const year = new Date().getFullYear();
  const prefix = `MT-${year}-`;
  const count = await prisma.maintenanceTicket.count({
    where: { organizationId: user.organizationId, ticketNumber: { startsWith: prefix } },
  });

  let ticket = null;
  for (let attempt = 0; attempt < 10 && !ticket; attempt++) {
    const ticketNumber = `${prefix}${String(count + 1 + attempt).padStart(4, "0")}`;
    try {
      ticket = await prisma.maintenanceTicket.create({
        data: {
          organizationId: user.organizationId,
          ticketNumber,
          assetId: asset.id,
          problem: input.problem,
          reportedById: user.id,
          technicianId,
          vendorId,
          priority: input.priority,
          status: "OPEN",
          remark: input.remark ?? null,
        },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
    }
  }
  if (!ticket) {
    return NextResponse.json({ error: "ticket_number_allocation_failed" }, { status: 500 });
  }

  await prisma.asset.update({ where: { id: asset.id }, data: { status: "IN_REPAIR" } });
  await prisma.assetHistory.create({
    data: {
      organizationId: user.organizationId,
      assetId: asset.id,
      action: "REPAIR",
      detail: `แจ้งซ่อม / Maintenance ticket ${ticket.ticketNumber} opened`,
      actorId: user.id,
    },
  });

  await auditLog(user, {
    action: "CREATE",
    entityType: "MAINTENANCE_TICKET",
    entityId: ticket.id,
    detail: { ticketNumber: ticket.ticketNumber, assetTag: asset.assetTag, via: "api" },
  });

  return NextResponse.json({ data: ticket }, { status: 201 });
});
