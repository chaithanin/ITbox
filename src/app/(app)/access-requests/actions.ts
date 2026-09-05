"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const REQ_STATUS = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PROVISIONED", "REVOKED"] as const;
const PROV_STATUS = ["PENDING", "ACCOUNT_CREATED", "ACCESS_GRANTED", "FAILED", "REVOKED"] as const;

export async function setRequestStatus(id: string, formData: FormData) {
  const user = await requirePermission("accessreq:manage");
  const status = z.enum(REQ_STATUS).parse(formData.get("status"));
  const existing = await prisma.accessRequest.findFirst({ where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true } });
  if (!existing) redirect("/access-requests");
  await prisma.accessRequest.update({ where: { id }, data: { status } });
  await auditLog(user, { action: "UPDATE", entityType: "ACCESS_REQUEST", entityId: id, detail: { status } });
  revalidatePath(`/access-requests/${id}`);
  redirect(`/access-requests/${id}`);
}

export async function setItemProvision(requestId: string, formData: FormData) {
  const user = await requirePermission("accessreq:manage");
  const itemId = z.string().uuid().parse(formData.get("itemId"));
  const provisionStatus = z.enum(PROV_STATUS).parse(formData.get("provisionStatus"));
  const item = await prisma.accessRequestItem.findFirst({ where: { id: itemId, request: { id: requestId, organizationId: user.organizationId } }, select: { id: true } });
  if (!item) redirect(`/access-requests/${requestId}`);
  await prisma.accessRequestItem.update({
    where: { id: itemId },
    data: { provisionStatus, provisionedById: user.id, provisionedAt: new Date() },
  });
  await auditLog(user, { action: "UPDATE", entityType: "ACCESS_REQUEST_ITEM", entityId: itemId, detail: { provisionStatus } });
  revalidatePath(`/access-requests/${requestId}`);
  redirect(`/access-requests/${requestId}`);
}
