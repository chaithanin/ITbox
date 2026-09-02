import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { canActOnStep, APPROVAL_CHAIN } from "@/lib/borrow/service";
import { BorrowTable, type BorrowRow } from "../borrow-table";

export const dynamic = "force-dynamic";

const STEP_STATUS: Record<string, string> = {
  MANAGER: "PENDING_MANAGER",
  IT: "PENDING_IT",
  MANAGEMENT: "PENDING_MANAGEMENT",
};

export default async function BorrowApprovalsPage() {
  const user = await requireUser();
  if (!user.permissions.has("borrow:approve")) {
    return <p className="text-sm text-muted-foreground">คุณไม่มีสิทธิ์อนุมัติ / You cannot approve borrow requests.</p>;
  }

  // Only surface the pending stages this user may actually act on.
  const statuses = APPROVAL_CHAIN.filter((s) => canActOnStep(user, s)).map((s) => STEP_STATUS[s]);

  const requests = statuses.length
    ? await prisma.borrowRequest.findMany({
        where: { organizationId: user.organizationId, deletedAt: null, status: { in: statuses as never[] } },
        select: {
          id: true, refNo: true, status: true, requesterName: true, dueDate: true,
          department: { select: { name: true } },
          requester: { select: { firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { submittedAt: "asc" },
        take: 100,
      })
    : [];

  const rows: BorrowRow[] = requests.map((r) => ({
    id: r.id, refNo: r.refNo, status: r.status, requesterName: r.requesterName, dueDate: r.dueDate,
    itemCount: r._count.items, requesterFallback: `${r.requester.firstName} ${r.requester.lastName}`,
    departmentName: r.department?.name ?? null,
  }));

  return (
    <div>
      <PageHeader title="รออนุมัติ / Approvals" description="คำขอยืมที่รอการอนุมัติจากคุณ / Borrow requests awaiting your decision" />
      <BorrowTable rows={rows} emptyText="ไม่มีคำขอรออนุมัติ / No requests awaiting your approval." />
    </div>
  );
}
