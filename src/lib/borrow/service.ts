/**
 * IT Asset Borrowing & Return — workflow engine.
 *
 * Pure(ish) service layer imported by the server actions in
 * src/app/(app)/borrow/actions.ts. Every state transition:
 *   - runs inside a $transaction with SELECT ... FOR UPDATE row locks so two
 *     concurrent actors cannot double-issue or double-approve;
 *   - keeps the asset lifecycle consistent (AVAILABLE ⇄ RESERVED ⇄ BORROWED …);
 *   - writes an immutable AssetHistory + audit entry via the caller.
 *
 * Approval chain (fixed 3 steps): MANAGER → IT → MANAGEMENT.
 * "Due soon" / "Overdue" are derived (see ./status), never stored.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/session";

type Tx = Prisma.TransactionClient;

export const APPROVAL_CHAIN = ["MANAGER", "IT", "MANAGEMENT"] as const;
export type ApprovalStep = (typeof APPROVAL_CHAIN)[number];

/** Which roles may act on each approval step (any-of). */
const STEP_ROLES: Record<ApprovalStep, string[]> = {
  MANAGER: ["MANAGER", "IT_MANAGER", "ADMIN", "SUPER_ADMIN"],
  IT: ["IT_STAFF", "IT_MANAGER", "ADMIN", "SUPER_ADMIN"],
  MANAGEMENT: ["IT_MANAGER", "ADMIN", "SUPER_ADMIN"],
};

const STEP_STATUS: Record<ApprovalStep, "PENDING_MANAGER" | "PENDING_IT" | "PENDING_MANAGEMENT"> = {
  MANAGER: "PENDING_MANAGER",
  IT: "PENDING_IT",
  MANAGEMENT: "PENDING_MANAGEMENT",
};

export class BorrowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BorrowError";
  }
}

export function canActOnStep(user: CurrentUser, step: ApprovalStep): boolean {
  return user.roles.some((r) => STEP_ROLES[step].includes(r));
}

// ------------------------------------------------------------------
// Reference number: IT-BR-<year>-0001  (count + unique-index retry)
// ------------------------------------------------------------------
async function nextRefNo(organizationId: string, year: number): Promise<{ refNo: string; refSeq: number }> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const count = await prisma.borrowRequest.count({
      where: { organizationId, refYear: year },
    });
    const seq = count + 1 + attempt;
    const refNo = `IT-BR-${year}-${String(seq).padStart(4, "0")}`;
    const exists = await prisma.borrowRequest.findFirst({
      where: { organizationId, refNo },
      select: { id: true },
    });
    if (!exists) return { refNo, refSeq: seq };
  }
  throw new BorrowError("REF_NO_CONFLICT");
}

// ------------------------------------------------------------------
// Create (optionally submit) a borrow request
// ------------------------------------------------------------------
export interface CreateBorrowInput {
  requesterEmployeeId: string;
  purpose?: string | null;
  useLocation?: string | null;
  borrowDate?: Date | null;
  dueDate?: Date | null;
  notes?: string | null;
  assetIds: string[];
  submit: boolean;
}

export async function createBorrowRequest(user: CurrentUser, input: CreateBorrowInput) {
  if (input.assetIds.length === 0) throw new BorrowError("NO_ASSETS");

  const employee = await prisma.employee.findFirst({
    where: { id: input.requesterEmployeeId, organizationId: user.organizationId, deletedAt: null },
    select: {
      id: true, firstName: true, lastName: true, position: true, phone: true, email: true,
      departmentId: true,
    },
  });
  if (!employee) throw new BorrowError("REQUESTER_NOT_FOUND");

  const year = new Date().getFullYear();
  const { refNo, refSeq } = await nextRefNo(user.organizationId, year);

  const created = await prisma.$transaction(async (tx) => {
    // Lock + validate each asset. On submit, only AVAILABLE assets may be
    // reserved (prevents double-borrow); drafts just record the intent.
    const assets = await lockAssets(tx, user.organizationId, input.assetIds);
    if (input.submit) {
      for (const a of assets) {
        if (a.status !== "AVAILABLE") {
          throw new BorrowError(`ASSET_UNAVAILABLE:${a.assetTag}`);
        }
      }
    }

    const request = await tx.borrowRequest.create({
      data: {
        organizationId: user.organizationId,
        refNo,
        refYear: year,
        refSeq,
        requesterEmployeeId: employee.id,
        departmentId: employee.departmentId,
        requesterName: `${employee.firstName} ${employee.lastName}`.trim(),
        requesterPosition: employee.position,
        requesterPhone: employee.phone,
        requesterEmail: employee.email,
        purpose: input.purpose ?? null,
        useLocation: input.useLocation ?? null,
        borrowDate: input.borrowDate ?? null,
        dueDate: input.dueDate ?? null,
        notes: input.notes ?? null,
        status: input.submit ? "PENDING_MANAGER" : "DRAFT",
        currentStep: input.submit ? "MANAGER" : null,
        submittedAt: input.submit ? new Date() : null,
        createdById: user.id,
        updatedById: user.id,
        items: {
          create: input.assetIds.map((assetId) => ({
            organizationId: user.organizationId,
            assetId,
            status: "PENDING",
          })),
        },
        ...(input.submit
          ? {
              approvals: {
                create: APPROVAL_CHAIN.map((step, i) => ({
                  organizationId: user.organizationId,
                  step,
                  sequence: i + 1,
                  status: "PENDING",
                })),
              },
            }
          : {}),
      },
      select: { id: true, refNo: true, status: true },
    });

    if (input.submit) {
      await reserveAssets(tx, user.organizationId, assets, request.id, user.id);
    }
    return request;
  });

  return created;
}

// ------------------------------------------------------------------
// Submit a draft
// ------------------------------------------------------------------
export async function submitBorrowRequest(user: CurrentUser, id: string) {
  return prisma.$transaction(async (tx) => {
    const req = await lockRequest(tx, user.organizationId, id);
    if (req.status !== "DRAFT") throw new BorrowError("NOT_DRAFT");

    const items = await tx.borrowRequestItem.findMany({
      where: { organizationId: user.organizationId, borrowRequestId: id },
      select: { assetId: true },
    });
    if (items.length === 0) throw new BorrowError("NO_ASSETS");

    const assets = await lockAssets(tx, user.organizationId, items.map((i) => i.assetId));
    for (const a of assets) {
      if (a.status !== "AVAILABLE") throw new BorrowError(`ASSET_UNAVAILABLE:${a.assetTag}`);
    }

    await tx.borrowApproval.createMany({
      data: APPROVAL_CHAIN.map((step, i) => ({
        organizationId: user.organizationId,
        borrowRequestId: id,
        step,
        sequence: i + 1,
        status: "PENDING" as const,
      })),
    });
    await tx.borrowRequest.update({
      where: { id },
      data: { status: "PENDING_MANAGER", currentStep: "MANAGER", submittedAt: new Date(), updatedById: user.id },
    });
    await reserveAssets(tx, user.organizationId, assets, id, user.id);
    return { id, refNo: req.refNo, status: "PENDING_MANAGER" as const };
  });
}

// ------------------------------------------------------------------
// Approve / reject the current step
// ------------------------------------------------------------------
export async function decideApproval(
  user: CurrentUser,
  id: string,
  decision: "APPROVE" | "REJECT",
  comment?: string | null
) {
  return prisma.$transaction(async (tx) => {
    const req = await lockRequest(tx, user.organizationId, id);
    if (!req.currentStep || !req.status.startsWith("PENDING_")) {
      throw new BorrowError("NOT_PENDING_APPROVAL");
    }
    const step = req.currentStep as ApprovalStep;
    if (!canActOnStep(user, step)) throw new BorrowError("FORBIDDEN_STEP");
    // Separation of duties: an approver may not approve their own request.
    if (req.requesterUserId && req.requesterUserId === user.id) {
      throw new BorrowError("SELF_APPROVAL_BLOCKED");
    }

    const approval = await tx.borrowApproval.findFirst({
      where: { organizationId: user.organizationId, borrowRequestId: id, step, status: "PENDING" },
      orderBy: { sequence: "asc" },
    });
    if (!approval) throw new BorrowError("APPROVAL_ROW_MISSING");

    if (decision === "REJECT") {
      await tx.borrowApproval.update({
        where: { id: approval.id },
        data: { status: "REJECTED", approverUserId: user.id, approverName: user.name, comment: comment ?? null, decidedAt: new Date() },
      });
      await tx.borrowRequest.update({
        where: { id },
        data: { status: "REJECTED", currentStep: null, rejectedAt: new Date(), rejectedReason: comment ?? null, updatedById: user.id },
      });
      await releaseReservedAssets(tx, user.organizationId, id, user.id, "rejected");
      return { id, refNo: req.refNo, status: "REJECTED" as const, requesterUserId: req.requesterUserId };
    }

    await tx.borrowApproval.update({
      where: { id: approval.id },
      data: { status: "APPROVED", approverUserId: user.id, approverName: user.name, comment: comment ?? null, decidedAt: new Date() },
    });
    const next = await tx.borrowApproval.findFirst({
      where: { organizationId: user.organizationId, borrowRequestId: id, status: "PENDING" },
      orderBy: { sequence: "asc" },
    });
    if (next) {
      await tx.borrowRequest.update({
        where: { id },
        data: { status: STEP_STATUS[next.step as ApprovalStep], currentStep: next.step, updatedById: user.id },
      });
      return { id, refNo: req.refNo, status: STEP_STATUS[next.step as ApprovalStep], requesterUserId: req.requesterUserId };
    }
    await tx.borrowRequest.update({
      where: { id },
      data: { status: "READY_TO_ISSUE", currentStep: null, approvedAt: new Date(), updatedById: user.id },
    });
    return { id, refNo: req.refNo, status: "READY_TO_ISSUE" as const, requesterUserId: req.requesterUserId };
  });
}

// ------------------------------------------------------------------
// Issue / handover
// ------------------------------------------------------------------
export interface IssueItemInput {
  borrowItemId: string;
  conditionBefore: "EXCELLENT" | "GOOD" | "FAIR" | "DAMAGED" | "OTHER";
  conditionNote?: string | null;
}
export interface IssueInput {
  items: IssueItemInput[];
  receivedByName?: string | null;
  note?: string | null;
}

export async function issueAssets(user: CurrentUser, id: string, input: IssueInput) {
  return prisma.$transaction(async (tx) => {
    const req = await lockRequest(tx, user.organizationId, id);
    if (req.status !== "READY_TO_ISSUE" && req.status !== "APPROVED") {
      throw new BorrowError("NOT_READY_TO_ISSUE");
    }
    const items = await tx.borrowRequestItem.findMany({
      where: { organizationId: user.organizationId, borrowRequestId: id, status: "PENDING" },
      include: { asset: { select: { id: true, assetTag: true, serialNumber: true } } },
    });
    if (items.length === 0) throw new BorrowError("NOTHING_TO_ISSUE");
    const condMap = new Map(input.items.map((i) => [i.borrowItemId, i]));

    const issue = await tx.assetIssueRecord.create({
      data: {
        organizationId: user.organizationId,
        borrowRequestId: id,
        issuedById: user.id,
        issuedByName: user.name,
        receivedByEmployeeId: req.requesterEmployeeId,
        receivedByName: input.receivedByName ?? req.requesterName,
        note: input.note ?? null,
        createdById: user.id,
      },
    });

    for (const item of items) {
      const c = condMap.get(item.id);
      await tx.$queryRaw`SELECT id FROM assets WHERE id = ${item.asset.id}::uuid FOR UPDATE`;
      await tx.asset.update({
        where: { id: item.asset.id },
        data: { status: "BORROWED" },
      });
      await tx.borrowRequestItem.update({ where: { id: item.id }, data: { status: "ISSUED" } });
      await tx.assetIssueItem.create({
        data: {
          organizationId: user.organizationId,
          issueRecordId: issue.id,
          borrowItemId: item.id,
          assetId: item.asset.id,
          conditionBefore: c?.conditionBefore ?? "GOOD",
          conditionNote: c?.conditionNote ?? null,
          serialSnapshot: item.asset.serialNumber,
        },
      });
      await tx.assetHistory.create({
        data: {
          organizationId: user.organizationId,
          assetId: item.asset.id,
          action: "BORROW_ISSUE",
          detail: `จ่ายให้ยืม / Issued on loan ${req.refNo} → ${input.receivedByName ?? req.requesterName ?? ""}`,
          actorId: user.id,
        },
      });
    }

    await tx.borrowRequest.update({
      where: { id },
      data: { status: "ISSUED", issuedAt: new Date(), updatedById: user.id },
    });
    return { id, refNo: req.refNo, requesterUserId: req.requesterUserId };
  });
}

// ------------------------------------------------------------------
// Return / inspection (supports partial returns)
// ------------------------------------------------------------------
export interface ReturnItemInput {
  borrowItemId: string;
  conditionAfter: "EXCELLENT" | "GOOD" | "FAIR" | "DAMAGED" | "OTHER";
  inspectionResult: "COMPLETE" | "DAMAGED" | "MISSING_ACCESSORY" | "REPAIR_REQUIRED" | "LOST";
  accessoriesComplete: boolean;
  accessoriesNote?: string | null;
  damageNote?: string | null;
}
export interface ReturnInput {
  items: ReturnItemInput[];
  returnedByName?: string | null;
  note?: string | null;
}

/** Map an inspection result to the resulting asset status + item status. */
function returnOutcome(result: ReturnItemInput["inspectionResult"]): {
  assetStatus: "AVAILABLE" | "IN_REPAIR" | "LOST";
  itemStatus: "RETURNED" | "DAMAGED" | "LOST";
} {
  switch (result) {
    case "LOST":
      return { assetStatus: "LOST", itemStatus: "LOST" };
    case "DAMAGED":
    case "REPAIR_REQUIRED":
      return { assetStatus: "IN_REPAIR", itemStatus: "DAMAGED" };
    default: // COMPLETE, MISSING_ACCESSORY
      return { assetStatus: "AVAILABLE", itemStatus: "RETURNED" };
  }
}

export async function returnAssets(user: CurrentUser, id: string, input: ReturnInput) {
  if (input.items.length === 0) throw new BorrowError("NOTHING_TO_RETURN");
  return prisma.$transaction(async (tx) => {
    const req = await lockRequest(tx, user.organizationId, id);
    if (req.status !== "ISSUED" && req.status !== "PARTIALLY_RETURNED") {
      throw new BorrowError("NOT_ON_LOAN");
    }

    const record = await tx.assetReturnRecord.create({
      data: {
        organizationId: user.organizationId,
        borrowRequestId: id,
        returnedByEmployeeId: req.requesterEmployeeId,
        returnedByName: input.returnedByName ?? req.requesterName,
        receivedById: user.id,
        receivedByName: user.name,
        note: input.note ?? null,
        // record-level result: worst of the item results (LOST > DAMAGED > …)
        inspectionResult: worstResult(input.items.map((i) => i.inspectionResult)),
        createdById: user.id,
      },
    });

    for (const r of input.items) {
      const item = await tx.borrowRequestItem.findFirst({
        where: { id: r.borrowItemId, organizationId: user.organizationId, borrowRequestId: id, status: "ISSUED" },
        include: { asset: { select: { id: true, assetTag: true } } },
      });
      if (!item) throw new BorrowError(`ITEM_NOT_ON_LOAN:${r.borrowItemId}`);
      const outcome = returnOutcome(r.inspectionResult);
      await tx.$queryRaw`SELECT id FROM assets WHERE id = ${item.asset.id}::uuid FOR UPDATE`;
      await tx.asset.update({
        where: { id: item.asset.id },
        data: { status: outcome.assetStatus, condition: r.conditionAfter === "OTHER" ? undefined : mapCondition(r.conditionAfter) },
      });
      await tx.borrowRequestItem.update({ where: { id: item.id }, data: { status: outcome.itemStatus } });
      await tx.assetReturnItem.create({
        data: {
          organizationId: user.organizationId,
          returnRecordId: record.id,
          borrowItemId: item.id,
          assetId: item.asset.id,
          conditionAfter: r.conditionAfter,
          inspectionResult: r.inspectionResult,
          accessoriesComplete: r.accessoriesComplete,
          accessoriesNote: r.accessoriesNote ?? null,
          damageNote: r.damageNote ?? null,
        },
      });
      await tx.assetHistory.create({
        data: {
          organizationId: user.organizationId,
          assetId: item.asset.id,
          action: "BORROW_RETURN",
          detail: `รับคืน / Returned ${req.refNo} (${r.inspectionResult}) → ${outcome.assetStatus}`,
          actorId: user.id,
        },
      });
    }

    // Any items still ISSUED ⇒ partial; else fully closed out.
    const remaining = await tx.borrowRequestItem.count({
      where: { organizationId: user.organizationId, borrowRequestId: id, status: "ISSUED" },
    });
    const fully = remaining === 0;
    await tx.borrowRequest.update({
      where: { id },
      data: fully
        ? { status: "CLOSED", returnedAt: new Date(), closedAt: new Date(), updatedById: user.id }
        : { status: "PARTIALLY_RETURNED", updatedById: user.id },
    });
    return { id, refNo: req.refNo, fully, requesterUserId: req.requesterUserId };
  });
}

// ------------------------------------------------------------------
// Cancel (requester withdraws, or manager voids before issue)
// ------------------------------------------------------------------
export async function cancelBorrowRequest(user: CurrentUser, id: string, reason?: string | null) {
  return prisma.$transaction(async (tx) => {
    const req = await lockRequest(tx, user.organizationId, id);
    const cancellable = ["DRAFT", "PENDING_MANAGER", "PENDING_IT", "PENDING_MANAGEMENT", "APPROVED", "READY_TO_ISSUE"];
    if (!cancellable.includes(req.status)) throw new BorrowError("NOT_CANCELLABLE");
    await tx.borrowRequest.update({
      where: { id },
      data: { status: "CANCELLED", currentStep: null, cancelledAt: new Date(), notes: reason ?? req.notes, updatedById: user.id },
    });
    await releaseReservedAssets(tx, user.organizationId, id, user.id, "cancelled");
    return { id, refNo: req.refNo, status: "CANCELLED" as const, requesterUserId: req.requesterUserId };
  });
}

// ------------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------------

/** Lock a borrow request row and return it with the requester's user id. */
async function lockRequest(tx: Tx, organizationId: string, id: string) {
  await tx.$queryRaw`SELECT id FROM borrow_requests WHERE id = ${id}::uuid FOR UPDATE`;
  const req = await tx.borrowRequest.findFirst({
    where: { id, organizationId, deletedAt: null },
    select: {
      id: true, refNo: true, status: true, currentStep: true,
      requesterEmployeeId: true, requesterName: true,
      notes: true,
      requester: { select: { userId: true } },
    },
  });
  if (!req) throw new BorrowError("REQUEST_NOT_FOUND");
  return { ...req, requesterUserId: req.requester?.userId ?? null };
}

async function lockAssets(tx: Tx, organizationId: string, assetIds: string[]) {
  const unique = [...new Set(assetIds)];
  for (const aid of unique) {
    await tx.$queryRaw`SELECT id FROM assets WHERE id = ${aid}::uuid FOR UPDATE`;
  }
  const assets = await tx.asset.findMany({
    where: { id: { in: unique }, organizationId, deletedAt: null },
    select: { id: true, assetTag: true, name: true, status: true },
  });
  if (assets.length !== unique.length) throw new BorrowError("ASSET_NOT_FOUND");
  return assets;
}

async function reserveAssets(
  tx: Tx,
  organizationId: string,
  assets: { id: string; assetTag: string }[],
  requestId: string,
  actorId: string
) {
  const refRow = await tx.borrowRequest.findUnique({ where: { id: requestId }, select: { refNo: true } });
  for (const a of assets) {
    await tx.asset.update({ where: { id: a.id }, data: { status: "RESERVED" } });
    await tx.assetHistory.create({
      data: {
        organizationId,
        assetId: a.id,
        action: "BORROW_RESERVE",
        detail: `จองสำหรับคำขอยืม / Reserved for borrow request ${refRow?.refNo ?? ""}`,
        actorId,
      },
    });
  }
}

/** Return still-reserved (not yet issued) assets to AVAILABLE on reject/cancel. */
async function releaseReservedAssets(tx: Tx, organizationId: string, requestId: string, actorId: string, why: string) {
  const items = await tx.borrowRequestItem.findMany({
    where: { organizationId, borrowRequestId: requestId, status: "PENDING" },
    include: { asset: { select: { id: true, status: true, assetTag: true } } },
  });
  const refRow = await tx.borrowRequest.findUnique({ where: { id: requestId }, select: { refNo: true } });
  for (const item of items) {
    if (item.asset.status !== "RESERVED") continue;
    await tx.$queryRaw`SELECT id FROM assets WHERE id = ${item.asset.id}::uuid FOR UPDATE`;
    await tx.asset.update({ where: { id: item.asset.id }, data: { status: "AVAILABLE" } });
    await tx.assetHistory.create({
      data: {
        organizationId,
        assetId: item.asset.id,
        action: "BORROW_RELEASE",
        detail: `ปล่อยการจอง (${why}) / Released reservation ${refRow?.refNo ?? ""}`,
        actorId,
      },
    });
  }
}

const RESULT_RANK: Record<ReturnItemInput["inspectionResult"], number> = {
  COMPLETE: 0, MISSING_ACCESSORY: 1, REPAIR_REQUIRED: 2, DAMAGED: 3, LOST: 4,
};
function worstResult(results: ReturnItemInput["inspectionResult"][]): ReturnItemInput["inspectionResult"] {
  return results.reduce((worst, r) => (RESULT_RANK[r] > RESULT_RANK[worst] ? r : worst), "COMPLETE");
}

/** Map the loan condition grade onto the asset's AssetCondition enum. */
function mapCondition(c: "EXCELLENT" | "GOOD" | "FAIR" | "DAMAGED"): "NEW" | "GOOD" | "FAIR" | "DAMAGED" {
  switch (c) {
    case "EXCELLENT": return "NEW";
    case "GOOD": return "GOOD";
    case "FAIR": return "FAIR";
    case "DAMAGED": return "DAMAGED";
  }
}
