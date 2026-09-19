"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const REQ_STATUS = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PROVISIONED", "REVOKED"] as const;
const PROV_STATUS = ["PENDING", "ACCOUNT_CREATED", "ACCESS_GRANTED", "FAILED", "REVOKED"] as const;
const APPROVAL_STEP = ["manager", "itSupport", "itManager", "management"] as const;

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

/**
 * Record one approval-workflow step on the request DOCUMENT (who signed off +
 * when + optional note). Document-only — grants no real system access. A reject
 * on any step moves the whole request to REJECTED with the reason; a manager
 * approval also advances SUBMITTED/DRAFT → APPROVED.
 */
export async function recordApprovalStep(id: string, formData: FormData) {
  const user = await requirePermission("accessreq:manage");
  const step = z.enum(APPROVAL_STEP).parse(formData.get("step"));
  const decision = z.enum(["approve", "reject"]).parse(formData.get("decision"));
  const note = ((formData.get("note") as string) || "").trim().slice(0, 500) || null;
  const signer = (((formData.get("signer") as string) || user.name || "").trim() || "—").slice(0, 120);

  const req = await prisma.accessRequest.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!req) redirect("/access-requests");

  const now = new Date();
  const data: Prisma.AccessRequestUpdateInput = {};
  if (decision === "reject") {
    data.status = "REJECTED";
    data.rejectionReason = note;
  } else if (step === "manager") {
    data.managerApprovedBy = signer; data.managerApprovedAt = now;
    if (req.status === "DRAFT" || req.status === "SUBMITTED") data.status = "APPROVED";
  } else if (step === "itSupport") {
    data.itSupportBy = signer; data.itSupportAt = now;
  } else if (step === "itManager") {
    data.itManagerBy = signer; data.itManagerAt = now;
  } else if (step === "management") {
    data.managementBy = signer; data.managementAt = now;
  }

  await prisma.accessRequest.update({ where: { id }, data });
  await auditLog(user, { action: "UPDATE", entityType: "ACCESS_REQUEST", entityId: id, detail: { approvalStep: step, decision, signer } });
  revalidatePath(`/access-requests/${id}`);
  redirect(`/access-requests/${id}`);
}
