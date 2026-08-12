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

const subscriptionSchema = z.object({
  serviceName: z.string().min(1).max(200),
  vendorId: optStr,
  plan: optStr,
  quantity: z.coerce.number().int().min(1).max(100000),
  cost: optNum,
  billingCycle: z.preprocess(
    emptyToNull,
    z.enum(["MONTHLY", "YEARLY"]).nullable().optional()
  ),
  startDate: optDate,
  renewalDate: optDate,
  status: z.enum(["ACTIVE", "CANCELLED", "EXPIRED"]),
  notes: optStr,
});

async function resolveVendorId(organizationId: string, vendorId: string | null | undefined) {
  if (!vendorId) return null;
  const vendor = await prisma.vendor.findFirst({
    where: { id: vendorId, organizationId, deletedAt: null },
    select: { id: true },
  });
  return vendor ? vendor.id : null;
}

export async function createSubscription(formData: FormData) {
  const user = await requirePermission("subscription:manage");
  const input = subscriptionSchema.parse(Object.fromEntries(formData));
  const vendorId = await resolveVendorId(user.organizationId, input.vendorId);

  const sub = await prisma.subscription.create({
    data: {
      organizationId: user.organizationId,
      serviceName: input.serviceName,
      vendorId,
      plan: input.plan ?? null,
      quantity: input.quantity,
      cost: input.cost ?? null,
      billingCycle: input.billingCycle ?? null,
      startDate: input.startDate ?? null,
      renewalDate: input.renewalDate ?? null,
      status: input.status,
      notes: input.notes ?? null,
    },
  });

  await auditLog(user, {
    action: "CREATE",
    entityType: "SUBSCRIPTION",
    entityId: sub.id,
    detail: { serviceName: sub.serviceName },
  });
  revalidatePath("/subscriptions");
  redirect("/subscriptions");
}

export async function updateSubscription(id: string, formData: FormData) {
  const user = await requirePermission("subscription:manage");
  const input = subscriptionSchema.parse(Object.fromEntries(formData));

  const existing = await prisma.subscription.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) redirect("/subscriptions");

  const vendorId = await resolveVendorId(user.organizationId, input.vendorId);

  await prisma.subscription.update({
    where: { id },
    data: {
      serviceName: input.serviceName,
      vendorId,
      plan: input.plan ?? null,
      quantity: input.quantity,
      cost: input.cost ?? null,
      billingCycle: input.billingCycle ?? null,
      startDate: input.startDate ?? null,
      renewalDate: input.renewalDate ?? null,
      status: input.status,
      notes: input.notes ?? null,
    },
  });

  await auditLog(user, {
    action: "UPDATE",
    entityType: "SUBSCRIPTION",
    entityId: id,
    detail: { serviceName: input.serviceName },
  });
  revalidatePath("/subscriptions");
  redirect("/subscriptions");
}

export async function deleteSubscription(id: string) {
  const user = await requirePermission("subscription:manage");
  const existing = await prisma.subscription.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, serviceName: true },
  });
  if (!existing) redirect("/subscriptions");

  await prisma.subscription.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, {
    action: "DELETE",
    entityType: "SUBSCRIPTION",
    entityId: id,
    detail: { serviceName: existing.serviceName },
  });
  revalidatePath("/subscriptions");
  redirect("/subscriptions");
}
