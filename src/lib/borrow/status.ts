/**
 * Borrow-request display status.
 *
 * The database stores the *lifecycle* status (DRAFT … CLOSED). "Due soon" and
 * "Overdue" are time-derived views of an on-loan request rather than stored
 * states, so they are computed here from the due date. This keeps the stored
 * status authoritative while letting the UI surface urgency without a cron job.
 */
import type { BorrowRequestStatus } from "@prisma/client";

export const DUE_SOON_DAYS = 3;

/** True while the request is physically out with the borrower. */
export function isOnLoan(status: BorrowRequestStatus): boolean {
  return status === "ISSUED" || status === "PARTIALLY_RETURNED";
}

/**
 * Map the stored status to a badge status, overlaying DUE_SOON / OVERDUE for
 * on-loan requests based on the due date.
 */
export function deriveDisplayStatus(
  status: BorrowRequestStatus,
  dueDate: Date | null,
  now: Date = new Date()
): string {
  if (isOnLoan(status) && dueDate) {
    const ms = dueDate.getTime() - now.getTime();
    if (ms < 0) return "OVERDUE";
    if (ms <= DUE_SOON_DAYS * 24 * 3600 * 1000) return "DUE_SOON";
  }
  return status;
}

/** Human bilingual label for each stored lifecycle status. */
export const BORROW_STATUS_LABELS: Record<string, string> = {
  DRAFT: "ร่าง / Draft",
  PENDING_MANAGER: "รอผู้จัดการอนุมัติ / Pending Manager",
  PENDING_IT: "รอ IT อนุมัติ / Pending IT",
  PENDING_MANAGEMENT: "รอผู้บริหารอนุมัติ / Pending Management",
  APPROVED: "อนุมัติแล้ว / Approved",
  REJECTED: "ไม่อนุมัติ / Rejected",
  READY_TO_ISSUE: "พร้อมจ่าย / Ready to Issue",
  ISSUED: "กำลังยืม / Issued",
  PARTIALLY_RETURNED: "คืนบางส่วน / Partially Returned",
  RETURNED: "คืนแล้ว / Returned",
  CLOSED: "ปิดงาน / Closed",
  CANCELLED: "ยกเลิก / Cancelled",
  DUE_SOON: "ใกล้ครบกำหนด / Due Soon",
  OVERDUE: "เกินกำหนด / Overdue",
};
