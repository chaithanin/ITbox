import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  // Asset
  AVAILABLE: "success",
  ASSIGNED: "default",
  IN_USE: "default",
  IN_REPAIR: "warning",
  LOST: "destructive",
  STOLEN: "destructive",
  DAMAGED: "destructive",
  RETIRED: "secondary",
  DISPOSED: "secondary",
  // Generic
  ACTIVE: "success",
  DISABLED: "secondary",
  LOCKED: "destructive",
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "destructive",
  COMPLETED: "success",
  CANCELLED: "secondary",
  EXPIRED: "secondary",
  USED: "secondary",
  OPEN: "warning",
  IN_PROGRESS: "default",
  WAITING_PART: "warning",
  WAITING_VENDOR: "warning",
  CHECKED_OUT: "default",
  RETURNED: "success",
  // Classification
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "warning",
  CRITICAL: "destructive",
  // Employee
  ON_LEAVE: "warning",
  OFFBOARDING: "warning",
  RESIGNED: "secondary",
  // Purchase
  DRAFT: "secondary",
  PENDING_MANAGER: "warning",
  PENDING_IT: "warning",
  PENDING_FINANCE: "warning",
  ORDERED: "default",
  RECEIVED: "success",
  REGISTERED: "success",
  // Results
  SUCCESS: "success",
  DENIED: "destructive",
  FAILED: "destructive",
  // Support case statuses
  NEW: "warning",
  TRIAGE: "warning",
  WAITING_USER: "warning",
  REOPENED: "warning",
  DUPLICATE: "secondary",
  // Case priorities
  P1: "destructive",
  P2: "warning",
  P3: "default",
  P4: "secondary",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{label ?? status.replaceAll("_", " ")}</Badge>;
}
