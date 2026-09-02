import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { BorrowTable, type BorrowRow } from "../borrow-table";

export const dynamic = "force-dynamic";

export default async function BorrowIssuePage() {
  const user = await requireUser();
  if (!user.permissions.has("borrow:issue")) {
    return <p className="text-sm text-muted-foreground">คุณไม่มีสิทธิ์จ่ายทรัพย์สิน / You cannot issue assets.</p>;
  }

  const requests = await prisma.borrowRequest.findMany({
    where: { organizationId: user.organizationId, deletedAt: null, status: { in: ["READY_TO_ISSUE", "APPROVED"] } },
    select: {
      id: true, refNo: true, status: true, requesterName: true, dueDate: true,
      department: { select: { name: true } },
      requester: { select: { firstName: true, lastName: true } },
      _count: { select: { items: true } },
    },
    orderBy: { approvedAt: "asc" },
    take: 100,
  });

  const rows: BorrowRow[] = requests.map((r) => ({
    id: r.id, refNo: r.refNo, status: r.status, requesterName: r.requesterName, dueDate: r.dueDate,
    itemCount: r._count.items, requesterFallback: `${r.requester.firstName} ${r.requester.lastName}`,
    departmentName: r.department?.name ?? null,
  }));

  return (
    <div>
      <PageHeader title="จ่าย-รับมอบ / Ready to Issue" description="คำขอที่อนุมัติแล้ว รอจ่ายอุปกรณ์ / Approved requests ready for handover" />
      <BorrowTable rows={rows} emptyText="ไม่มีรายการรอจ่าย / Nothing ready to issue." />
    </div>
  );
}
