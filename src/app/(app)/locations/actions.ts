"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const locationSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  building: z.string().max(200).optional(),
  floor: z.string().max(50).optional(),
  room: z.string().max(50).optional(),
});

const nul = (v: string | undefined) => (v ? v : null);

export async function createLocation(formData: FormData) {
  const user = await requirePermission("location:manage");
  const input = locationSchema.parse(Object.fromEntries(formData));

  // Find-or-resurrect a soft-deleted code instead of colliding on the unique
  // (which still counts deleted rows) — DB-005.
  const existing = await prisma.location.findFirst({
    where: { organizationId: user.organizationId, code: input.code },
    select: { id: true, deletedAt: true },
  });
  if (existing && !existing.deletedAt) throw new Error("Location code already exists");

  const fields = {
    name: input.name,
    address: nul(input.address),
    building: nul(input.building),
    floor: nul(input.floor),
    room: nul(input.room),
  };
  const row = existing
    ? await prisma.location.update({ where: { id: existing.id }, data: { ...fields, deletedAt: null } })
    : await prisma.location.create({ data: { organizationId: user.organizationId, code: input.code, ...fields } });
  await auditLog(user, {
    action: "CREATE",
    entityType: "LOCATION",
    entityId: row.id,
    detail: { code: row.code, name: row.name },
  });
  revalidatePath("/locations");
  redirect("/locations");
}

export async function updateLocation(formData: FormData) {
  const user = await requirePermission("location:manage");
  const id = z.uuid().parse(formData.get("id"));
  const input = locationSchema.parse(Object.fromEntries(formData));

  const existing = await prisma.location.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Location not found");

  const dup = await prisma.location.findFirst({
    where: { organizationId: user.organizationId, code: input.code, deletedAt: null, NOT: { id } },
    select: { id: true },
  });
  if (dup) throw new Error("Location code already exists");

  const row = await prisma.location.update({
    where: { id },
    data: {
      code: input.code,
      name: input.name,
      address: nul(input.address),
      building: nul(input.building),
      floor: nul(input.floor),
      room: nul(input.room),
    },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "LOCATION",
    entityId: row.id,
    detail: { code: row.code, name: row.name },
  });
  revalidatePath("/locations");
  redirect("/locations");
}

export async function softDeleteLocation(formData: FormData) {
  const user = await requirePermission("location:manage");
  const id = z.uuid().parse(formData.get("id"));

  const existing = await prisma.location.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, code: true, name: true },
  });
  if (!existing) throw new Error("Location not found");

  const activeEmployees = await prisma.employee.count({
    where: { organizationId: user.organizationId, locationId: id, deletedAt: null },
  });
  if (activeEmployees > 0) {
    throw new Error("Cannot delete a location that still has active employees");
  }

  await prisma.location.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, {
    action: "DELETE",
    entityType: "LOCATION",
    entityId: id,
    detail: { code: existing.code, name: existing.name },
  });
  revalidatePath("/locations");
  redirect("/locations");
}
