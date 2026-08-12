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

const vendorSchema = z.object({
  name: z.string().min(1).max(200),
  contactName: optStr,
  phone: optStr,
  email: z.preprocess(emptyToNull, z.string().email().max(320).nullable().optional()),
  address: optStr,
  taxId: optStr,
  category: optStr,
  rating: z.preprocess((v) => {
    const s = emptyToNull(v);
    return s == null ? null : Number(s);
  }, z.number().int().min(1).max(5).nullable().optional()),
  notes: optStr,
});

function toData(input: z.infer<typeof vendorSchema>) {
  return {
    name: input.name,
    contactName: input.contactName ?? null,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    taxId: input.taxId ?? null,
    category: input.category ?? null,
    rating: input.rating ?? null,
    notes: input.notes ?? null,
  };
}

export async function createVendor(formData: FormData) {
  const user = await requirePermission("vendor:manage");
  const input = vendorSchema.parse(Object.fromEntries(formData));

  const vendor = await prisma.vendor.create({
    data: { organizationId: user.organizationId, ...toData(input) },
  });

  await auditLog(user, {
    action: "CREATE",
    entityType: "VENDOR",
    entityId: vendor.id,
    detail: { name: vendor.name },
  });
  revalidatePath("/vendors");
  redirect(`/vendors/${vendor.id}`);
}

export async function updateVendor(id: string, formData: FormData) {
  const user = await requirePermission("vendor:manage");
  const input = vendorSchema.parse(Object.fromEntries(formData));

  const existing = await prisma.vendor.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) redirect("/vendors");

  await prisma.vendor.update({ where: { id }, data: toData(input) });

  await auditLog(user, {
    action: "UPDATE",
    entityType: "VENDOR",
    entityId: id,
    detail: { name: input.name },
  });
  revalidatePath("/vendors");
  revalidatePath(`/vendors/${id}`);
  redirect(`/vendors/${id}`);
}

export async function deleteVendor(id: string) {
  const user = await requirePermission("vendor:manage");
  const existing = await prisma.vendor.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!existing) redirect("/vendors");

  await prisma.vendor.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, {
    action: "DELETE",
    entityType: "VENDOR",
    entityId: id,
    detail: { name: existing.name },
  });
  revalidatePath("/vendors");
  redirect("/vendors");
}
