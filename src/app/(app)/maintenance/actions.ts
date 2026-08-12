"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const optStr = z.preprocess(emptyToNull, z.string().max(5000).nullable().optional());
const optNum = z.preprocess((v) => {
  const s = emptyToNull(v);
  return s == null ? null : Number(s);
}, z.number().min(0).nullable().optional());

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_PART",
  "WAITING_VENDOR",
  "COMPLETED",
  "CANCELLED",
] as const;

const createSchema = z.object({
  assetId: z.string().min(1),
  problem: z.string().min(1).max(5000),
  priority: z.enum(PRIORITIES),
  technicianId: optStr,
  vendorId: optStr,
  remark: optStr,
});

const updateSchema = z.object({
  status: z.enum(STATUSES),
  diagnosis: optStr,
  repairCost: optNum,
  parts: optStr,
  remark: optStr,
});

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function createTicket(formData: FormData) {
  const user = await requirePermission("maintenance:manage");
  const input = createSchema.parse(Object.fromEntries(formData));

  const asset = await prisma.asset.findFirst({
    where: {
      id: input.assetId,
      organizationId: user.organizationId,
      deletedAt: null,
      status: { not: "DISPOSED" },
    },
    select: { id: true, assetTag: true, name: true, status: true },
  });
  if (!asset) redirect("/maintenance/new?error=asset");

  if (input.technicianId) {
    const technician = await prisma.employee.findFirst({
      where: { id: input.technicianId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!technician) input.technicianId = null;
  }
  if (input.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!vendor) input.vendorId = null;
  }

  const year = new Date().getFullYear();
  const prefix = `MT-${year}-`;
  const count = await prisma.maintenanceTicket.count({
    where: { organizationId: user.organizationId, ticketNumber: { startsWith: prefix } },
  });

  let ticket: { id: string; ticketNumber: string } | null = null;
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
          technicianId: input.technicianId ?? null,
          vendorId: input.vendorId ?? null,
          priority: input.priority,
          status: "OPEN",
          remark: input.remark ?? null,
        },
        select: { id: true, ticketNumber: true },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  if (!ticket) throw new Error("Could not allocate ticket number");

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
    detail: { ticketNumber: ticket.ticketNumber, assetTag: asset.assetTag },
  });

  revalidatePath("/maintenance");
  redirect(`/maintenance/${ticket.id}`);
}

export async function updateTicket(id: string, formData: FormData) {
  const user = await requirePermission("maintenance:manage");
  const input = updateSchema.parse(Object.fromEntries(formData));

  const ticket = await prisma.maintenanceTicket.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: { asset: { select: { id: true, assetTag: true, status: true } } },
  });
  if (!ticket) redirect("/maintenance");

  const statusChanged = ticket.status !== input.status;
  const closing =
    statusChanged && (input.status === "COMPLETED" || input.status === "CANCELLED");

  await prisma.maintenanceTicket.update({
    where: { id },
    data: {
      status: input.status,
      diagnosis: input.diagnosis ?? null,
      repairCost: input.repairCost ?? null,
      parts: input.parts ?? null,
      remark: input.remark ?? null,
      ...(statusChanged && input.status === "IN_PROGRESS" && !ticket.startedAt
        ? { startedAt: new Date() }
        : {}),
      ...(statusChanged && input.status === "COMPLETED" ? { completedAt: new Date() } : {}),
    },
  });

  // On close (completed or cancelled): return the asset to service if it is
  // still marked IN_REPAIR.
  if (closing && ticket.asset.status === "IN_REPAIR") {
    await prisma.asset.update({
      where: { id: ticket.asset.id },
      data: { status: "AVAILABLE" },
    });
    await prisma.assetHistory.create({
      data: {
        organizationId: user.organizationId,
        assetId: ticket.asset.id,
        action: "REPAIR",
        detail:
          input.status === "COMPLETED"
            ? `ซ่อมเสร็จ / Ticket ${ticket.ticketNumber} completed — asset back to AVAILABLE`
            : `ยกเลิกงานซ่อม / Ticket ${ticket.ticketNumber} cancelled — asset back to AVAILABLE`,
        actorId: user.id,
      },
    });
  }

  await auditLog(user, {
    action: "UPDATE",
    entityType: "MAINTENANCE_TICKET",
    entityId: id,
    detail: { ticketNumber: ticket.ticketNumber, status: input.status },
  });

  revalidatePath("/maintenance");
  revalidatePath(`/maintenance/${id}`);
  redirect(`/maintenance/${id}`);
}
