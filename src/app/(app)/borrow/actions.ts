"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import {
  createBorrowRequest, submitBorrowRequest, decideApproval, issueAssets,
  returnAssets, cancelBorrowRequest, BorrowError,
} from "@/lib/borrow/service";

const LOAN_CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "DAMAGED", "OTHER"] as const;
const INSPECTION_RESULTS = ["COMPLETE", "DAMAGED", "MISSING_ACCESSORY", "REPAIR_REQUIRED", "LOST"] as const;

function optStr(v: FormDataEntryValue | null): string | null {
  const t = (v as string | null)?.trim();
  return t ? t : null;
}
function optDate(v: FormDataEntryValue | null): Date | null {
  const t = (v as string | null)?.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Translate BorrowError codes into a friendly bilingual message for the UI. */
function borrowErrorMessage(code: string): string {
  const [key, arg] = code.split(":");
  const map: Record<string, string> = {
    NO_ASSETS: "กรุณาเลือกทรัพย์สินอย่างน้อย 1 รายการ / Select at least one asset",
    REQUESTER_NOT_FOUND: "ไม่พบข้อมูลผู้ขอ / Requester not found",
    ASSET_UNAVAILABLE: `ทรัพย์สิน ${arg ?? ""} ไม่ว่างให้ยืม / Asset ${arg ?? ""} is not available`,
    ASSET_NOT_FOUND: "ไม่พบทรัพย์สินบางรายการ / Some assets not found",
    NOT_DRAFT: "คำขอนี้ไม่ใช่ฉบับร่าง / Request is not a draft",
    NOT_PENDING_APPROVAL: "คำขอนี้ไม่อยู่ในขั้นรออนุมัติ / Not awaiting approval",
    FORBIDDEN_STEP: "คุณไม่มีสิทธิ์อนุมัติขั้นนี้ / You cannot approve this step",
    SELF_APPROVAL_BLOCKED: "ไม่สามารถอนุมัติคำขอของตนเองได้ / Cannot approve your own request",
    NOT_READY_TO_ISSUE: "คำขอยังไม่พร้อมจ่าย / Request is not ready to issue",
    NOTHING_TO_ISSUE: "ไม่มีรายการให้จ่าย / Nothing to issue",
    NOT_ON_LOAN: "คำขอนี้ไม่ได้อยู่ระหว่างยืม / Request is not on loan",
    NOTHING_TO_RETURN: "ไม่มีรายการให้คืน / Nothing to return",
    NOT_CANCELLABLE: "ไม่สามารถยกเลิกคำขอในสถานะนี้ / Cannot cancel in this status",
    REQUEST_NOT_FOUND: "ไม่พบคำขอ / Request not found",
    REF_NO_CONFLICT: "สร้างเลขที่คำขอไม่สำเร็จ กรุณาลองใหม่ / Could not allocate a ref no., try again",
  };
  return map[key] ?? code;
}

async function notify(orgId: string, userId: string | null | undefined, title: string, body: string, link: string, level: "INFO" | "WARNING" = "INFO") {
  if (!userId) return;
  await prisma.notification.create({
    data: { organizationId: orgId, userId, type: "BORROW", level, title, body, link },
  });
}

/** Notify users holding a role that can act on the given approval step. */
async function notifyApprovers(orgId: string, roleKeys: string[], refNo: string, id: string) {
  const users = await prisma.user.findMany({
    where: {
      organizationId: orgId, deletedAt: null, status: "ACTIVE",
      userRoles: { some: { role: { key: { in: roleKeys } } } },
    },
    select: { id: true },
    take: 50,
  });
  if (users.length === 0) return;
  await prisma.notification.createMany({
    data: users.map((u) => ({
      organizationId: orgId, userId: u.id, type: "BORROW", level: "INFO" as const,
      title: `มีคำขอยืมรออนุมัติ / Borrow request awaiting approval: ${refNo}`,
      body: `คำขอ ${refNo} รอการอนุมัติจากคุณ`, link: `/borrow/${id}`,
    })),
  });
}

const STEP_NOTIFY_ROLES: Record<string, string[]> = {
  PENDING_MANAGER: ["MANAGER", "IT_MANAGER", "ADMIN", "SUPER_ADMIN"],
  PENDING_IT: ["IT_STAFF", "IT_MANAGER", "ADMIN", "SUPER_ADMIN"],
  PENDING_MANAGEMENT: ["IT_MANAGER", "ADMIN", "SUPER_ADMIN"],
};

// ------------------------------------------------------------------
// Create
// ------------------------------------------------------------------
export async function createBorrowAction(formData: FormData) {
  const user = await requirePermission("borrow:create");
  const requesterEmployeeId = z.string().uuid().parse(formData.get("requesterEmployeeId"));
  const assetIds = formData.getAll("assetId").map((v) => String(v)).filter(Boolean);
  const submit = formData.get("submit") === "true" || formData.get("submit") === "1";

  let result;
  try {
    result = await createBorrowRequest(user, {
      requesterEmployeeId,
      purpose: optStr(formData.get("purpose")),
      useLocation: optStr(formData.get("useLocation")),
      borrowDate: optDate(formData.get("borrowDate")),
      dueDate: optDate(formData.get("dueDate")),
      notes: optStr(formData.get("notes")),
      assetIds,
      submit,
    });
  } catch (e) {
    if (e instanceof BorrowError) {
      redirect(`/borrow/new?error=${encodeURIComponent(borrowErrorMessage(e.message))}`);
    }
    throw e;
  }

  await auditLog(user, {
    action: submit ? "BORROW_SUBMIT" : "BORROW_CREATE",
    entityType: "BORROW_REQUEST",
    entityId: result.id,
    detail: { refNo: result.refNo, assetCount: assetIds.length, submit },
  });
  if (submit) {
    await notifyApprovers(user.organizationId, STEP_NOTIFY_ROLES.PENDING_MANAGER, result.refNo, result.id);
  }
  revalidatePath("/borrow");
  redirect(`/borrow/${result.id}`);
}

// ------------------------------------------------------------------
// Submit a draft
// ------------------------------------------------------------------
export async function submitBorrowAction(formData: FormData) {
  const user = await requirePermission("borrow:create");
  const id = z.string().uuid().parse(formData.get("id"));
  let result;
  try {
    result = await submitBorrowRequest(user, id);
  } catch (e) {
    if (e instanceof BorrowError) redirect(`/borrow/${id}?error=${encodeURIComponent(borrowErrorMessage(e.message))}`);
    throw e;
  }
  await auditLog(user, { action: "BORROW_SUBMIT", entityType: "BORROW_REQUEST", entityId: id, detail: { refNo: result.refNo } });
  await notifyApprovers(user.organizationId, STEP_NOTIFY_ROLES.PENDING_MANAGER, result.refNo, id);
  revalidatePath(`/borrow/${id}`);
  revalidatePath("/borrow");
  redirect(`/borrow/${id}`);
}

// ------------------------------------------------------------------
// Approve / reject
// ------------------------------------------------------------------
export async function decideApprovalAction(formData: FormData) {
  const user = await requirePermission("borrow:approve");
  const id = z.string().uuid().parse(formData.get("id"));
  const decision = z.enum(["APPROVE", "REJECT"]).parse(formData.get("decision"));
  const comment = optStr(formData.get("comment"));

  let result;
  try {
    result = await decideApproval(user, id, decision, comment);
  } catch (e) {
    if (e instanceof BorrowError) redirect(`/borrow/${id}?error=${encodeURIComponent(borrowErrorMessage(e.message))}`);
    throw e;
  }
  await auditLog(user, {
    action: decision === "APPROVE" ? "BORROW_APPROVE" : "BORROW_REJECT",
    entityType: "BORROW_REQUEST", entityId: id, detail: { refNo: result.refNo, toStatus: result.status },
  });

  if (result.status === "REJECTED") {
    await notify(user.organizationId, result.requesterUserId, `คำขอยืมถูกปฏิเสธ / Borrow request rejected: ${result.refNo}`, comment ?? "", `/borrow/${id}`, "WARNING");
  } else if (result.status === "READY_TO_ISSUE") {
    await notify(user.organizationId, result.requesterUserId, `คำขอยืมได้รับอนุมัติ / Borrow request approved: ${result.refNo}`, "พร้อมรับอุปกรณ์ที่ฝ่าย IT / Ready to collect at IT", `/borrow/${id}`);
    await notifyApprovers(user.organizationId, ["IT_STAFF", "IT_MANAGER", "ADMIN", "SUPER_ADMIN"], result.refNo, id);
  } else if (STEP_NOTIFY_ROLES[result.status]) {
    await notifyApprovers(user.organizationId, STEP_NOTIFY_ROLES[result.status], result.refNo, id);
  }
  revalidatePath(`/borrow/${id}`);
  revalidatePath("/borrow");
  redirect(`/borrow/${id}`);
}

// ------------------------------------------------------------------
// Issue / handover
// ------------------------------------------------------------------
const issueItemSchema = z.object({
  borrowItemId: z.string().uuid(),
  conditionBefore: z.enum(LOAN_CONDITIONS),
  conditionNote: z.string().nullish(),
});
export async function issueAction(formData: FormData) {
  const user = await requirePermission("borrow:issue");
  const id = z.string().uuid().parse(formData.get("id"));
  const items = z.array(issueItemSchema).parse(JSON.parse(String(formData.get("items") ?? "[]")));

  let result;
  try {
    result = await issueAssets(user, id, {
      items: items.map((i) => ({ ...i, conditionNote: i.conditionNote ?? null })),
      receivedByName: optStr(formData.get("receivedByName")),
      note: optStr(formData.get("note")),
    });
  } catch (e) {
    if (e instanceof BorrowError) redirect(`/borrow/${id}?error=${encodeURIComponent(borrowErrorMessage(e.message))}`);
    throw e;
  }
  await auditLog(user, { action: "BORROW_ISSUE", entityType: "BORROW_REQUEST", entityId: id, detail: { refNo: result.refNo, items: items.length } });
  await notify(user.organizationId, result.requesterUserId, `รับมอบอุปกรณ์แล้ว / Assets issued: ${result.refNo}`, "กรุณาคืนภายในกำหนด / Please return by the due date", `/borrow/${id}`);
  revalidatePath(`/borrow/${id}`);
  revalidatePath("/borrow");
  redirect(`/borrow/${id}`);
}

// ------------------------------------------------------------------
// Return / inspection
// ------------------------------------------------------------------
const returnItemSchema = z.object({
  borrowItemId: z.string().uuid(),
  conditionAfter: z.enum(LOAN_CONDITIONS),
  inspectionResult: z.enum(INSPECTION_RESULTS),
  accessoriesComplete: z.boolean(),
  accessoriesNote: z.string().nullish(),
  damageNote: z.string().nullish(),
});
export async function returnAction(formData: FormData) {
  const user = await requirePermission("borrow:return");
  const id = z.string().uuid().parse(formData.get("id"));
  const items = z.array(returnItemSchema).parse(JSON.parse(String(formData.get("items") ?? "[]")));

  let result;
  try {
    result = await returnAssets(user, id, {
      items: items.map((i) => ({
        ...i,
        accessoriesNote: i.accessoriesNote ?? null,
        damageNote: i.damageNote ?? null,
      })),
      returnedByName: optStr(formData.get("returnedByName")),
      note: optStr(formData.get("note")),
    });
  } catch (e) {
    if (e instanceof BorrowError) redirect(`/borrow/${id}?error=${encodeURIComponent(borrowErrorMessage(e.message))}`);
    throw e;
  }
  await auditLog(user, { action: "BORROW_RETURN", entityType: "BORROW_REQUEST", entityId: id, detail: { refNo: result.refNo, items: items.length, fully: result.fully } });
  await notify(user.organizationId, result.requesterUserId, `บันทึกการคืนแล้ว / Return recorded: ${result.refNo}`, result.fully ? "ปิดคำขอเรียบร้อย / Request closed" : "คืนบางส่วน / Partial return", `/borrow/${id}`);
  revalidatePath(`/borrow/${id}`);
  revalidatePath("/borrow");
  redirect(`/borrow/${id}`);
}

// ------------------------------------------------------------------
// Cancel
// ------------------------------------------------------------------
export async function cancelAction(formData: FormData) {
  const user = await requirePermission("borrow:create");
  const id = z.string().uuid().parse(formData.get("id"));
  const reason = optStr(formData.get("reason"));
  let result;
  try {
    result = await cancelBorrowRequest(user, id, reason);
  } catch (e) {
    if (e instanceof BorrowError) redirect(`/borrow/${id}?error=${encodeURIComponent(borrowErrorMessage(e.message))}`);
    throw e;
  }
  await auditLog(user, { action: "BORROW_CANCEL", entityType: "BORROW_REQUEST", entityId: id, detail: { refNo: result.refNo } });
  revalidatePath(`/borrow/${id}`);
  revalidatePath("/borrow");
  redirect(`/borrow/${id}`);
}
