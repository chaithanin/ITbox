"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { decideApprovalAction } from "./actions";

/**
 * Approve / reject panel. The decision travels in a hidden input rather than
 * the submit button's name/value — a submit button's name/value is NOT included
 * in a Server Action's FormData in this Next/React version, so relying on it
 * made `decision` arrive null and the action throw. Each button sets the hidden
 * input before the form submits.
 */
export function BorrowApprovalForm({ id }: { id: string }) {
  const decisionRef = useRef<HTMLInputElement>(null);
  const set = (v: "APPROVE" | "REJECT") => {
    if (decisionRef.current) decisionRef.current.value = v;
  };
  return (
    <form action={decideApprovalAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" ref={decisionRef} defaultValue="APPROVE" />
      <textarea
        name="comment"
        rows={2}
        placeholder="ความเห็น (ถ้ามี) / Comment (optional)"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        <Button type="submit" variant="destructive" onClick={() => set("REJECT")}>
          ไม่อนุมัติ / Reject
        </Button>
        <Button type="submit" onClick={() => set("APPROVE")}>
          อนุมัติ / Approve
        </Button>
      </div>
    </form>
  );
}
