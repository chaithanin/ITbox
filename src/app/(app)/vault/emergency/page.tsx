import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import { decideEmergencyAction } from "../actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function EmergencyPage() {
  const user = await requirePermission("vault:read");
  const canDecide = user.permissions.has("vault:emergency");

  const requests = await prisma.vaultEmergencyRequest.findMany({
    where: {
      organizationId: user.organizationId,
      ...(canDecide ? {} : { requesterId: user.id }),
    },
    include: {
      vaultItem: { select: { id: true, name: true, classification: true } },
      requester: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const pending = requests.filter((r) => r.status === "PENDING");
  const past = requests.filter((r) => r.status !== "PENDING");

  return (
    <div>
      <PageHeader
        title="การเข้าถึงฉุกเฉิน / Emergency Access (Break Glass)"
        description="คำขอเข้าถึงข้อมูลลับกรณีฉุกเฉิน ต้องได้รับอนุมัติและมีเวลาหมดอายุ ทุกขั้นตอนถูกบันทึก"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>รออนุมัติ / Pending ({pending.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.length === 0 && (
              <p className="text-sm text-muted-foreground">ไม่มีคำขอค้าง / No pending requests</p>
            )}
            {pending.map((r) => {
              const decideAction = decideEmergencyAction.bind(null, r.id);
              return (
                <div key={r.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/vault/${r.vaultItem.id}`} className="font-medium hover:underline">
                      {r.vaultItem.name}
                    </Link>
                    <StatusBadge status={r.vaultItem.classification} />
                  </div>
                  <p className="mt-1 text-sm">
                    <span className="text-muted-foreground">ผู้ขอ / Requester:</span>{" "}
                    {r.requester.name} ({r.requester.email})
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">เหตุผล: {r.reason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</p>
                  {canDecide && r.requesterId !== user.id && (
                    <form action={decideAction} className="mt-2 flex flex-wrap items-center gap-2">
                      <Select name="hours" defaultValue="2" className="w-28">
                        <option value="1">1 ชม.</option>
                        <option value="2">2 ชม.</option>
                        <option value="4">4 ชม.</option>
                        <option value="8">8 ชม.</option>
                        <option value="24">24 ชม.</option>
                      </Select>
                      <Button type="submit" name="decision" value="APPROVED" size="sm">
                        อนุมัติ / Approve
                      </Button>
                      <Button type="submit" name="decision" value="REJECTED" variant="destructive" size="sm">
                        ปฏิเสธ / Reject
                      </Button>
                    </form>
                  )}
                  {canDecide && r.requesterId === user.id && (
                    <p className="mt-2 text-xs text-amber-600">ไม่สามารถอนุมัติคำขอของตนเอง / Cannot self-approve</p>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ประวัติ / History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {past.length === 0 && (
              <p className="text-sm text-muted-foreground">ไม่มีประวัติ / No history</p>
            )}
            {past.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.vaultItem.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.requester.name} · {formatDateTime(r.createdAt)}
                    {r.expiresAt && r.status === "APPROVED" && ` · หมดอายุ ${formatDateTime(r.expiresAt)}`}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
