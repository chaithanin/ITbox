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

const MAX_ITEMS = 5;
const APPROVER_ROLE_KEYS = ["MANAGER", "IT_MANAGER", "FINANCE"];

const STEP_BY_STATUS: Record<string, { step: number; stepName: string; next: "PENDING_IT" | "PENDING_FINANCE" | "APPROVED" }> = {
  PENDING_MANAGER: { step: 1, stepName: "MANAGER", next: "PENDING_IT" },
  PENDING_IT: { step: 2, stepName: "IT", next: "PENDING_FINANCE" },
  PENDING_FINANCE: { step: 3, stepName: "FINANCE", next: "APPROVED" },
};

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function createPurchaseRequest(formData: FormData) {
  const user = await requirePermission("procurement:create");

  const reason = z.string().min(1).max(5000).parse(formData.get("reason"));
  const departmentId = z
    .preprocess(emptyToNull, z.string().nullable())
    .parse(formData.get("departmentId"));
  const vendorId = z
    .preprocess(emptyToNull, z.string().nullable())
    .parse(formData.get("vendorId"));

  // Parse up to MAX_ITEMS item rows (item0_desc / item0_qty / item0_cost, ...)
  const itemSchema = z.object({
    description: z.string().min(1).max(1000),
    quantity: z.coerce.number().int().min(1).max(100000),
    estimatedCost: z.preprocess((v) => {
      const s = emptyToNull(v);
      return s == null ? null : Number(s);
    }, z.number().min(0).nullable()),
  });
  const items: z.infer<typeof itemSchema>[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const desc = formData.get(`item${i}_desc`);
    if (typeof desc !== "string" || desc.trim() === "") continue;
    items.push(
      itemSchema.parse({
        description: desc.trim(),
        quantity: formData.get(`item${i}_qty`) ?? 1,
        estimatedCost: formData.get(`item${i}_cost`),
      })
    );
  }
  if (items.length === 0) redirect("/procurement/new?error=items");

  let resolvedDepartmentId: string | null = null;
  if (departmentId) {
    const dep = await prisma.department.findFirst({
      where: { id: departmentId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    resolvedDepartmentId = dep?.id ?? null;
  }
  let resolvedVendorId: string | null = null;
  if (vendorId) {
    const vendor = await prisma.vendor.findFirst({
      where: { id: vendorId, organizationId: user.organizationId, deletedAt: null },
      select: { id: true },
    });
    resolvedVendorId = vendor?.id ?? null;
  }

  const totalEstimated = items.reduce(
    (sum, it) => sum + (it.estimatedCost ?? 0) * it.quantity,
    0
  );

  const year = new Date().getFullYear();
  const prefix = `PR-${year}-`;
  const count = await prisma.purchaseRequest.count({
    where: { organizationId: user.organizationId, requestNumber: { startsWith: prefix } },
  });

  let request: { id: string; requestNumber: string } | null = null;
  for (let attempt = 0; attempt < 10 && !request; attempt++) {
    const requestNumber = `${prefix}${String(count + 1 + attempt).padStart(4, "0")}`;
    try {
      request = await prisma.purchaseRequest.create({
        data: {
          organizationId: user.organizationId,
          requestNumber,
          requesterId: user.id,
          departmentId: resolvedDepartmentId,
          vendorId: resolvedVendorId,
          reason,
          status: "PENDING_MANAGER",
          totalEstimated,
          items: {
            create: items.map((it) => ({
              description: it.description,
              quantity: it.quantity,
              estimatedCost: it.estimatedCost,
            })),
          },
        },
        select: { id: true, requestNumber: true },
      });
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  if (!request) throw new Error("Could not allocate request number");

  // Three-step approval chain: MANAGER → IT → FINANCE
  await prisma.approval.createMany({
    data: [
      { step: 1, stepName: "MANAGER" },
      { step: 2, stepName: "IT" },
      { step: 3, stepName: "FINANCE" },
    ].map((s) => ({
      organizationId: user.organizationId,
      subjectType: "PURCHASE_REQUEST",
      subjectId: request.id,
      purchaseRequestId: request.id,
      step: s.step,
      stepName: s.stepName,
      decision: "PENDING" as const,
    })),
  });

  // Notify potential approvers
  const approvers = await prisma.user.findMany({
    where: {
      organizationId: user.organizationId,
      deletedAt: null,
      status: "ACTIVE",
      userRoles: { some: { role: { key: { in: APPROVER_ROLE_KEYS }, deletedAt: null } } },
    },
    select: { id: true },
  });
  if (approvers.length > 0) {
    await prisma.notification.createMany({
      data: approvers.map((a) => ({
        organizationId: user.organizationId,
        userId: a.id,
        type: "APPROVAL_PENDING",
        level: "INFO" as const,
        title: `คำขอจัดซื้อรออนุมัติ / Purchase request ${request.requestNumber} pending approval`,
        body: reason.slice(0, 500),
        link: `/procurement/${request.id}`,
      })),
    });
  }

  await auditLog(user, {
    action: "CREATE",
    entityType: "PURCHASE_REQUEST",
    entityId: request.id,
    detail: { requestNumber: request.requestNumber, totalEstimated, itemCount: items.length },
  });

  revalidatePath("/procurement");
  redirect(`/procurement/${request.id}`);
}

async function loadPendingRequest(userOrgId: string, id: string) {
  const request = await prisma.purchaseRequest.findFirst({
    where: { id, organizationId: userOrgId, deletedAt: null },
  });
  if (!request) redirect("/procurement");
  return request;
}

async function notifyRequester(
  organizationId: string,
  requesterId: string | null,
  requestId: string,
  requestNumber: string,
  approved: boolean,
  stepName: string
) {
  if (!requesterId) return;
  await prisma.notification.create({
    data: {
      organizationId,
      userId: requesterId,
      type: "APPROVAL_RESULT",
      level: approved ? "INFO" : "WARNING",
      title: approved
        ? `คำขอ ${requestNumber} ผ่านขั้น ${stepName} / Request ${requestNumber} approved at ${stepName} step`
        : `คำขอ ${requestNumber} ถูกปฏิเสธ / Request ${requestNumber} rejected at ${stepName} step`,
      link: `/procurement/${requestId}`,
    },
  });
}

export async function approvePurchaseRequest(id: string, formData: FormData) {
  const user = await requirePermission("procurement:approve");
  const comment = z
    .preprocess(emptyToNull, z.string().max(2000).nullable())
    .parse(formData.get("comment"));

  const request = await loadPendingRequest(user.organizationId, id);
  const stepInfo = STEP_BY_STATUS[request.status];
  if (!stepInfo) redirect(`/procurement/${id}`);

  const approval = await prisma.approval.findFirst({
    where: {
      organizationId: user.organizationId,
      purchaseRequestId: id,
      step: stepInfo.step,
      decision: "PENDING",
    },
    select: { id: true },
  });
  if (approval) {
    await prisma.approval.update({
      where: { id: approval.id },
      data: {
        approverId: user.id,
        decision: "APPROVED",
        comment,
        decidedAt: new Date(),
      },
    });
  }

  await prisma.purchaseRequest.update({
    where: { id },
    data: { status: stepInfo.next },
  });

  await notifyRequester(
    user.organizationId,
    request.requesterId,
    id,
    request.requestNumber,
    true,
    stepInfo.stepName
  );

  await auditLog(user, {
    action: "APPROVE",
    entityType: "PURCHASE_REQUEST",
    entityId: id,
    detail: { requestNumber: request.requestNumber, step: stepInfo.stepName, nextStatus: stepInfo.next },
  });

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${id}`);
  redirect(`/procurement/${id}`);
}

export async function rejectPurchaseRequest(id: string, formData: FormData) {
  const user = await requirePermission("procurement:approve");
  const comment = z
    .preprocess(emptyToNull, z.string().max(2000).nullable())
    .parse(formData.get("comment"));

  const request = await loadPendingRequest(user.organizationId, id);
  const stepInfo = STEP_BY_STATUS[request.status];
  if (!stepInfo) redirect(`/procurement/${id}`);

  const approval = await prisma.approval.findFirst({
    where: {
      organizationId: user.organizationId,
      purchaseRequestId: id,
      step: stepInfo.step,
      decision: "PENDING",
    },
    select: { id: true },
  });
  if (approval) {
    await prisma.approval.update({
      where: { id: approval.id },
      data: {
        approverId: user.id,
        decision: "REJECTED",
        comment,
        decidedAt: new Date(),
      },
    });
  }

  await prisma.purchaseRequest.update({ where: { id }, data: { status: "REJECTED" } });

  await notifyRequester(
    user.organizationId,
    request.requesterId,
    id,
    request.requestNumber,
    false,
    stepInfo.stepName
  );

  await auditLog(user, {
    action: "REJECT",
    entityType: "PURCHASE_REQUEST",
    entityId: id,
    detail: { requestNumber: request.requestNumber, step: stepInfo.stepName },
  });

  revalidatePath("/procurement");
  revalidatePath(`/procurement/${id}`);
  redirect(`/procurement/${id}`);
}

export async function markPurchaseOrdered(id: string) {
  const user = await requirePermission("procurement:approve");
  const request = await loadPendingRequest(user.organizationId, id);
  if (request.status !== "APPROVED") redirect(`/procurement/${id}`);

  await prisma.purchaseRequest.update({ where: { id }, data: { status: "ORDERED" } });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "PURCHASE_REQUEST",
    entityId: id,
    detail: { requestNumber: request.requestNumber, status: "ORDERED" },
  });
  revalidatePath("/procurement");
  revalidatePath(`/procurement/${id}`);
  redirect(`/procurement/${id}`);
}

export async function markPurchaseReceived(id: string) {
  const user = await requirePermission("procurement:approve");
  const request = await loadPendingRequest(user.organizationId, id);
  if (request.status !== "ORDERED") redirect(`/procurement/${id}`);

  await prisma.purchaseRequest.update({ where: { id }, data: { status: "RECEIVED" } });
  await notifyRequester(
    user.organizationId,
    request.requesterId,
    id,
    request.requestNumber,
    true,
    "RECEIVED"
  );
  await auditLog(user, {
    action: "UPDATE",
    entityType: "PURCHASE_REQUEST",
    entityId: id,
    detail: { requestNumber: request.requestNumber, status: "RECEIVED" },
  });
  revalidatePath("/procurement");
  revalidatePath(`/procurement/${id}`);
  redirect(`/procurement/${id}`);
}
