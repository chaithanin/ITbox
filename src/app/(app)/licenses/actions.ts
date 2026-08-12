"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v;

const optStr = z.preprocess(emptyToNull, z.string().max(5000).nullable().optional());
const optDate = z.preprocess((v) => {
  const s = emptyToNull(v);
  return s == null ? null : new Date(String(s));
}, z.date().nullable().optional());
const optNum = z.preprocess((v) => {
  const s = emptyToNull(v);
  return s == null ? null : Number(s);
}, z.number().min(0).nullable().optional());

const licenseSchema = z.object({
  softwareName: z.string().min(1).max(200),
  vendorId: optStr,
  licenseType: z.preprocess(
    emptyToNull,
    z.enum(["PERPETUAL", "SUBSCRIPTION", "OEM", "VOLUME"]).nullable().optional()
  ),
  totalSeats: z.coerce.number().int().min(1).max(100000),
  purchaseDate: optDate,
  startDate: optDate,
  expiresAt: optDate,
  cost: optNum,
  renewalCost: optNum,
  autoRenewal: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  notes: optStr,
});

export async function createLicense(formData: FormData) {
  const user = await requirePermission("license:manage");
  const input = licenseSchema.parse(Object.fromEntries(formData));

  if (input.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!vendor) input.vendorId = null;
  }

  const license = await prisma.license.create({
    data: {
      organizationId: user.organizationId,
      softwareName: input.softwareName,
      vendorId: input.vendorId ?? null,
      licenseType: input.licenseType ?? null,
      totalSeats: input.totalSeats,
      purchaseDate: input.purchaseDate ?? null,
      startDate: input.startDate ?? null,
      expiresAt: input.expiresAt ?? null,
      cost: input.cost ?? null,
      renewalCost: input.renewalCost ?? null,
      autoRenewal: input.autoRenewal,
      notes: input.notes ?? null,
    },
  });

  await auditLog(user, {
    action: "CREATE",
    entityType: "LICENSE",
    entityId: license.id,
    detail: { softwareName: license.softwareName },
  });
  revalidatePath("/licenses");
  redirect(`/licenses/${license.id}`);
}

export async function updateLicense(id: string, formData: FormData) {
  const user = await requirePermission("license:manage");
  const input = licenseSchema.parse(Object.fromEntries(formData));

  const existing = await prisma.license.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) redirect("/licenses");

  if (input.vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: input.vendorId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!vendor) input.vendorId = null;
  }

  await prisma.license.update({
    where: { id },
    data: {
      softwareName: input.softwareName,
      vendorId: input.vendorId ?? null,
      licenseType: input.licenseType ?? null,
      totalSeats: input.totalSeats,
      purchaseDate: input.purchaseDate ?? null,
      startDate: input.startDate ?? null,
      expiresAt: input.expiresAt ?? null,
      cost: input.cost ?? null,
      renewalCost: input.renewalCost ?? null,
      autoRenewal: input.autoRenewal,
      notes: input.notes ?? null,
    },
  });

  await auditLog(user, {
    action: "UPDATE",
    entityType: "LICENSE",
    entityId: id,
    detail: { softwareName: input.softwareName },
  });
  revalidatePath("/licenses");
  revalidatePath(`/licenses/${id}`);
  redirect(`/licenses/${id}`);
}

export async function deleteLicense(id: string) {
  const user = await requirePermission("license:manage");
  const existing = await prisma.license.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, softwareName: true },
  });
  if (!existing) redirect("/licenses");

  await prisma.license.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, {
    action: "DELETE",
    entityType: "LICENSE",
    entityId: id,
    detail: { softwareName: existing.softwareName },
  });
  revalidatePath("/licenses");
  redirect("/licenses");
}

export async function assignLicense(licenseId: string, formData: FormData) {
  const user = await requirePermission("license:manage");
  const employeeId = z.string().min(1).parse(formData.get("employeeId"));

  const license = await prisma.license.findFirst({
    where: { id: licenseId, organizationId: user.organizationId, deletedAt: null },
    include: {
      _count: { select: { assignments: { where: { revokedAt: null } } } },
    },
  });
  if (!license) redirect("/licenses");

  const employee = await prisma.employee.findFirst({
    where: {
      id: employeeId,
      organizationId: user.organizationId,
      deletedAt: null,
      status: "ACTIVE",
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!employee) redirect(`/licenses/${licenseId}?error=employee`);

  if (license._count.assignments >= license.totalSeats) {
    redirect(`/licenses/${licenseId}?error=full`);
  }

  const assignment = await prisma.licenseAssignment.create({
    data: { licenseId, employeeId: employee.id },
  });

  await auditLog(user, {
    action: "ASSIGN",
    entityType: "LICENSE",
    entityId: licenseId,
    detail: {
      assignmentId: assignment.id,
      employee: `${employee.firstName} ${employee.lastName}`,
    },
  });
  revalidatePath(`/licenses/${licenseId}`);
  redirect(`/licenses/${licenseId}`);
}

export async function revokeLicenseAssignment(assignmentId: string) {
  const user = await requirePermission("license:manage");

  const assignment = await prisma.licenseAssignment.findFirst({
    where: {
      id: assignmentId,
      revokedAt: null,
      license: { organizationId: user.organizationId, deletedAt: null },
    },
    select: { id: true, licenseId: true },
  });
  if (!assignment) redirect("/licenses");

  await prisma.licenseAssignment.update({
    where: { id: assignment.id },
    data: { revokedAt: new Date() },
  });

  await auditLog(user, {
    action: "REVOKE",
    entityType: "LICENSE",
    entityId: assignment.licenseId,
    detail: { assignmentId: assignment.id },
  });
  revalidatePath(`/licenses/${assignment.licenseId}`);
  redirect(`/licenses/${assignment.licenseId}`);
}
