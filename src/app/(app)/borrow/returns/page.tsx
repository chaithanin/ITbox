import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { BorrowTable, type BorrowRow } from "../borrow-table";

export const dynamic = "force-dynamic";

export default async function BorrowReturnsPage() {
  const user = await requireUser();
  if (!user.permissions.has("borrow:return")) {
    return <p className="text-sm text-muted-foreground">คุณไม่มีสิทธิ์รับคืนทรัพย์สิน / You cannot process returns.</p>;
  }

  const requests = await prisma.borrowRequest.findMany({
    where: { organizationId: user.organizationId, deletedAt: null, status: { in: ["ISSUED", "PARTIALLY_RETURNED"] } },
    select: {
      id: true, refNo: true, status: true, requesterName: true, dueDate: true,
      department: { select: { name: true } },
      requester: { select: { firstName: true, lastName: true } },
      _count: { select: { items: true } },
    },
    orderBy: { dueDate: "asc" },
    take: 100,
  });

  const rows: BorrowRow[] = requests.map((r) => ({
    id: r.id, refNo: r.refNo, status: r.status, requesterName: r.requesterName, dueDate: r.dueDate,
    itemCount: r._count.items, requesterFallback: `${r.requester.firstName} ${r.requester.lastName}`,
    departmentName: r.department?.name ?? null,
  }));

  return (
    <div>
      <PageHeader title="รับคืน / Returns" description="ทรัพย์สินที่กำลังยืม รอรับคืน / Assets on loan awaiting return" />
      <BorrowTable rows={rows} emptyText="ไม่มีรายการค้างคืน / Nothing on loan." />
    </div>
  );
}
