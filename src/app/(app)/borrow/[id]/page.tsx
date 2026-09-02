import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Printer, Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { canActOnStep, type ApprovalStep } from "@/lib/borrow/service";
import { deriveDisplayStatus, BORROW_STATUS_LABELS } from "@/lib/borrow/status";
import { BorrowIssueForm } from "../borrow-issue-form";
import { BorrowReturnForm } from "../borrow-return-form";
import { BorrowApprovalForm } from "../borrow-approval-form";
import { submitBorrowAction, cancelAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function BorrowDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("borrow:read")) return notFound();
  const { id } = await params;
  const sp = await searchParams;

  const req = await prisma.borrowRequest.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      requester: { select: { firstName: true, lastName: true, employeeCode: true, userId: true } },
      department: { select: { name: true } },
      items: {
        include: { asset: { select: { id: true, assetTag: true, name: true, serialNumber: true } } },
        orderBy: { createdAt: "asc" },
      },
      approvals: { orderBy: { sequence: "asc" } },
      issues: {
        include: { items: { select: { borrowItemId: true, conditionBefore: true, conditionNote: true } } },
        orderBy: { createdAt: "asc" },
      },
      returns: {
        include: { items: { select: { borrowItemId: true, conditionAfter: true, inspectionResult: true, damageNote: true, accessoriesComplete: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!req) return notFound();

  const now = new Date();
  const display = deriveDisplayStatus(req.status, req.dueDate, now);
  const isRequester = req.requester.userId === user.id;

  // Which action panel to show
  const isPendingApproval = req.status.startsWith("PENDING_") && !!req.currentStep;
  const canApprove =
    isPendingApproval &&
    user.permissions.has("borrow:approve") &&
    canActOnStep(user, req.currentStep as ApprovalStep) &&
    !isRequester;
  const canIssue = (req.status === "READY_TO_ISSUE" || req.status === "APPROVED") && user.permissions.has("borrow:issue");
  const canReturn = (req.status === "ISSUED" || req.status === "PARTIALLY_RETURNED") && user.permissions.has("borrow:return");
  const canSubmit = req.status === "DRAFT" && user.permissions.has("borrow:create");
  const cancellable = ["DRAFT", "PENDING_MANAGER", "PENDING_IT", "PENDING_MANAGEMENT", "APPROVED", "READY_TO_ISSUE"].includes(req.status);
  const canCancel = cancellable && user.permissions.has("borrow:create");

  const pendingItems = req.items.filter((i) => i.status === "PENDING");
  const issuedItems = req.items.filter((i) => i.status === "ISSUED");

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/borrow" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> กลับ / Back
      </Link>
      <PageHeader title={req.refNo} description={BORROW_STATUS_LABELS[req.status] ?? req.status}>
        <StatusBadge status={display} />
        <Button variant="outline" asChild>
          <a href={`/api/borrow/${req.id}/pdf`} target="_blank" rel="noopener">
            <Printer className="h-4 w-4" /> พิมพ์ / Print
          </a>
        </Button>
        <Button variant="outline" asChild>
          <a href={`/api/borrow/${req.id}/pdf?download=1`}>
            <Download className="h-4 w-4" /> ดาวน์โหลด PDF
          </a>
        </Button>
      </PageHeader>

      {sp.error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {sp.error}
        </div>
      )}

      {/* Requester */}
      <Card className="mb-4">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 p-5 text-sm md:grid-cols-4">
          <Field label="ผู้ขอ / Requester" value={req.requesterName ?? `${req.requester.firstName} ${req.requester.lastName}`} />
          <Field label="รหัสพนักงาน / Code" value={req.requester.employeeCode} />
          <Field label="ตำแหน่ง / Position" value={req.requesterPosition ?? "—"} />
          <Field label="แผนก / Department" value={req.department?.name ?? "—"} />
          <Field label="โทร / Phone" value={req.requesterPhone ?? "—"} />
          <Field label="วันที่ยืม / Borrow date" value={req.borrowDate ? formatDate(req.borrowDate) : "—"} />
          <Field label="กำหนดคืน / Due date" value={req.dueDate ? formatDate(req.dueDate) : "—"} />
          <Field label="สถานที่ใช้งาน / Location" value={req.useLocation ?? "—"} />
          {req.purpose && <div className="col-span-2 md:col-span-4"><Field label="วัตถุประสงค์ / Purpose" value={req.purpose} /></div>}
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="mb-4">
        <div className="border-b px-5 py-3 text-sm font-semibold">ทรัพย์สิน / Assets ({req.items.length})</div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ชื่อ / Name</TableHead>
              <TableHead>รหัส / Tag</TableHead>
              <TableHead>Serial No.</TableHead>
              <TableHead>สถานะ / Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {req.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell>
                  <Link href={`/assets/${i.asset.id}`} className="hover:underline">{i.asset.name}</Link>
                </TableCell>
                <TableCell className="font-medium">{i.asset.assetTag}</TableCell>
                <TableCell>{i.asset.serialNumber ?? "—"}</TableCell>
                <TableCell><StatusBadge status={i.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Approval timeline */}
      {req.approvals.length > 0 && (
        <Card className="mb-4">
          <div className="border-b px-5 py-3 text-sm font-semibold">ลำดับการอนุมัติ / Approval Timeline</div>
          <ol className="divide-y">
            {req.approvals.map((a) => (
              <li key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <p className="font-medium">
                    {a.step === "MANAGER" ? "ผู้จัดการแผนก / Dept Manager"
                      : a.step === "IT" ? "ฝ่าย IT / IT"
                      : "ผู้บริหาร / Management"}
                  </p>
                  {a.approverName && <p className="text-xs text-muted-foreground">{a.approverName}{a.decidedAt ? ` · ${formatDateTime(a.decidedAt)}` : ""}</p>}
                  {a.comment && <p className="mt-0.5 text-xs italic text-muted-foreground">“{a.comment}”</p>}
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Action panels */}
      {canApprove && (
        <Card className="mb-4 border-primary/40">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold">การอนุมัติของคุณ / Your Decision</h2>
            <BorrowApprovalForm id={req.id} />
          </CardContent>
        </Card>
      )}

      {canIssue && pendingItems.length > 0 && (
        <Card className="mb-4 border-primary/40">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold">จ่าย-รับมอบทรัพย์สิน / Issue &amp; Handover</h2>
            <BorrowIssueForm
              requestId={req.id}
              items={pendingItems.map((i) => ({ borrowItemId: i.id, assetTag: i.asset.assetTag, name: i.asset.name, serialNumber: i.asset.serialNumber }))}
            />
          </CardContent>
        </Card>
      )}

      {canReturn && issuedItems.length > 0 && (
        <Card className="mb-4 border-primary/40">
          <CardContent className="p-5">
            <h2 className="mb-3 text-sm font-semibold">รับคืนทรัพย์สิน / Return &amp; Inspection</h2>
            <BorrowReturnForm
              requestId={req.id}
              items={issuedItems.map((i) => ({ borrowItemId: i.id, assetTag: i.asset.assetTag, name: i.asset.name }))}
            />
          </CardContent>
        </Card>
      )}

      {(canSubmit || canCancel) && (
        <div className="flex flex-wrap justify-end gap-2">
          {canSubmit && (
            <form action={submitBorrowAction}>
              <input type="hidden" name="id" value={req.id} />
              <Button type="submit">ส่งขออนุมัติ / Submit for approval</Button>
            </form>
          )}
          {canCancel && (
            <form action={cancelAction}>
              <input type="hidden" name="id" value={req.id} />
              <Button type="submit" variant="outline">ยกเลิกคำขอ / Cancel request</Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
