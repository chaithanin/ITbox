import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, PackagePlus, XCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PROCUREMENT_ENABLED } from "@/lib/features";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmButton } from "@/components/confirm-button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import {
  approvePurchaseRequest,
  rejectPurchaseRequest,
  markPurchaseOrdered,
  markPurchaseReceived,
} from "../actions";

const PENDING_STEP: Record<string, number> = {
  PENDING_MANAGER: 1,
  PENDING_IT: 2,
  PENDING_FINANCE: 3,
};

const STEP_LABELS: Record<string, string> = {
  MANAGER: "ผู้จัดการ / Manager",
  IT: "ฝ่ายไอที / IT",
  FINANCE: "ฝ่ายการเงิน / Finance",
};

const APPROVAL_ERRORS: Record<string, string> = {
  "self-approval": "คุณไม่สามารถอนุมัติคำขอที่คุณเป็นผู้ยื่นเองได้ / You cannot approve your own request.",
  "step-role": "คุณไม่มีบทบาทที่อนุมัติขั้นตอนนี้ / You don't hold the role required for this approval step.",
  "already-decided": "คุณได้ตัดสินขั้นตอนอื่นของคำขอนี้แล้ว — ต้องใช้ผู้อนุมัติคนละคนต่อขั้น / You already decided another step; each step needs a different approver.",
  "state-changed": "สถานะคำขอเปลี่ยนไปแล้ว โปรดรีเฟรช / The request changed; please refresh and retry.",
};

export default async function PurchaseRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  if (!PROCUREMENT_ENABLED) notFound();
  const { id } = await params;
  const approvalError = APPROVAL_ERRORS[(await searchParams).error ?? ""];
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("procurement:read")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const request = await prisma.purchaseRequest.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      department: { select: { name: true, code: true } },
      vendor: { select: { id: true, name: true } },
      items: true,
      approvals: {
        include: { approver: { select: { name: true } } },
        orderBy: { step: "asc" },
      },
    },
  });
  if (!request) notFound();

  const requester = request.requesterId
    ? await prisma.user.findFirst({
        where: { id: request.requesterId, organizationId: user.organizationId },
        select: { name: true, email: true },
      })
    : null;

  const canApprove = user.permissions.has("procurement:approve");
  const currentStep = PENDING_STEP[request.status];
  const isPending = currentStep !== undefined;

  const itemsTotal = request.items.reduce(
    (sum, it) => sum + (it.estimatedCost === null ? 0 : Number(it.estimatedCost)) * it.quantity,
    0
  );

  const info: { label: string; value: React.ReactNode }[] = [
    { label: "ผู้ขอ / Requester", value: requester?.name ?? "-" },
    {
      label: "แผนก / Department",
      value: request.department ? `${request.department.name} (${request.department.code})` : "-",
    },
    {
      label: "ผู้จำหน่าย / Vendor",
      value: request.vendor ? (
        <Link href={`/vendors/${request.vendor.id}`} className="text-primary hover:underline">
          {request.vendor.name}
        </Link>
      ) : (
        "-"
      ),
    },
    { label: "สถานะ / Status", value: <StatusBadge status={request.status} /> },
    {
      label: "ยอดประมาณ / Total estimated",
      value: `฿${formatMoney(request.totalEstimated)}`,
    },
    { label: "วันที่สร้าง / Created", value: formatDateTime(request.createdAt) },
  ];

  return (
    <div>
      <PageHeader
        title={`คำขอจัดซื้อ ${request.requestNumber}`}
        description="รายละเอียดคำขอจัดซื้อ / Purchase request detail"
      >
        <Button variant="outline" asChild>
          <Link href="/procurement">กลับ / Back</Link>
        </Button>
        {canApprove && request.status === "APPROVED" && (
          <form action={markPurchaseOrdered.bind(null, request.id)}>
            <ConfirmButton confirmText="ยืนยันสั่งซื้อแล้ว? / Mark as ordered?">
              สั่งซื้อแล้ว / Mark Ordered
            </ConfirmButton>
          </form>
        )}
        {canApprove && request.status === "ORDERED" && (
          <form action={markPurchaseReceived.bind(null, request.id)}>
            <ConfirmButton confirmText="ยืนยันรับของแล้ว? / Mark as received?">
              รับของแล้ว / Mark Received
            </ConfirmButton>
          </form>
        )}
        {request.status === "RECEIVED" && (
          <Button asChild>
            <Link href="/assets/new">
              <PackagePlus className="h-4 w-4" /> ลงทะเบียนทรัพย์สิน / Register asset
            </Link>
          </Button>
        )}
      </PageHeader>

      {approvalError && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {approvalError}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>ข้อมูลคำขอ / Request info</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {info.map((row) => (
                  <div key={row.label} className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
                    <dd className="text-right font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
              {request.reason && (
                <div className="mt-4 border-t pt-3 text-sm">
                  <p className="mb-1 text-muted-foreground">เหตุผล / Reason</p>
                  <p className="whitespace-pre-wrap">{request.reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>รายการ / Items</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รายละเอียด / Description</TableHead>
                    <TableHead className="text-right">จำนวน / Qty</TableHead>
                    <TableHead className="text-right">ราคา/หน่วย / Est. cost</TableHead>
                    <TableHead className="text-right">รวม / Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {request.items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">{it.description}</TableCell>
                      <TableCell className="text-right tabular-nums">{it.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(it.estimatedCost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(
                          (it.estimatedCost === null ? 0 : Number(it.estimatedCost)) * it.quantity
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} className="text-right font-semibold">
                      รวมทั้งหมด / Total
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      ฿{formatMoney(itemsTotal)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>ขั้นตอนอนุมัติ / Approval timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {request.approvals.map((a) => {
                  const isCurrent = currentStep === a.step;
                  return (
                    <li key={a.id} className="flex items-start gap-3">
                      {a.decision === "APPROVED" ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : a.decision === "REJECTED" ? (
                        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                      ) : (
                        <Clock
                          className={
                            isCurrent
                              ? "mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400"
                              : "mt-0.5 h-5 w-5 shrink-0 text-muted-foreground/50"
                          }
                        />
                      )}
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">
                          {a.step}. {a.stepName ? STEP_LABELS[a.stepName] ?? a.stepName : "-"}{" "}
                          {isCurrent && (
                            <span className="text-xs font-normal text-amber-600 dark:text-amber-400">
                              (รออนุมัติ / awaiting)
                            </span>
                          )}
                        </p>
                        <p className="text-muted-foreground">
                          {a.decision === "PENDING"
                            ? "รอพิจารณา / Pending"
                            : `${a.decision === "APPROVED" ? "อนุมัติ / Approved" : "ปฏิเสธ / Rejected"} โดย ${a.approver?.name ?? "-"}`}
                        </p>
                        {a.decidedAt && (
                          <p className="text-xs text-muted-foreground">{formatDateTime(a.decidedAt)}</p>
                        )}
                        {a.comment && (
                          <p className="mt-1 whitespace-pre-wrap rounded bg-muted/60 px-2 py-1 text-xs">
                            {a.comment}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          {canApprove && isPending && (
            <Card>
              <CardHeader>
                <CardTitle>
                  พิจารณาขั้นที่ {currentStep} / Decide step {currentStep}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3">
                  <div>
                    <Label htmlFor="approve-comment">ความเห็น / Comment</Label>
                    <Textarea id="approve-comment" name="comment" rows={2} className="mt-1" />
                  </div>
                  <div className="flex gap-2">
                    <ConfirmButton
                      formAction={approvePurchaseRequest.bind(null, request.id)}
                      confirmText="อนุมัติคำขอนี้? / Approve this request?"
                    >
                      อนุมัติ / Approve
                    </ConfirmButton>
                    <ConfirmButton
                      variant="destructive"
                      formAction={rejectPurchaseRequest.bind(null, request.id)}
                      confirmText="ปฏิเสธคำขอนี้? / Reject this request?"
                    >
                      ปฏิเสธ / Reject
                    </ConfirmButton>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
