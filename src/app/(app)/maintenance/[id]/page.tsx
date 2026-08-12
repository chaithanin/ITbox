import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime, formatMoney } from "@/lib/utils";
import { updateTicket } from "../actions";

const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_PART",
  "WAITING_VENDOR",
  "COMPLETED",
  "CANCELLED",
] as const;

export default async function MaintenanceTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("maintenance:read")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const ticket = await prisma.maintenanceTicket.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      asset: { select: { id: true, assetTag: true, name: true, status: true } },
      vendor: { select: { id: true, name: true } },
    },
  });
  if (!ticket) notFound();

  const [technician, reporter] = await Promise.all([
    ticket.technicianId
      ? prisma.employee.findFirst({
          where: { id: ticket.technicianId, organizationId: user.organizationId },
          select: { firstName: true, lastName: true, employeeCode: true },
        })
      : null,
    ticket.reportedById
      ? prisma.user.findFirst({
          where: { id: ticket.reportedById, organizationId: user.organizationId },
          select: { name: true },
        })
      : null,
  ]);

  const canManage = user.permissions.has("maintenance:manage");
  const isClosed = ticket.status === "COMPLETED" || ticket.status === "CANCELLED";

  const info: { label: string; value: React.ReactNode }[] = [
    {
      label: "ทรัพย์สิน / Asset",
      value: (
        <span className="flex items-center justify-end gap-2">
          <Link href={`/assets/${ticket.asset.id}`} className="text-primary hover:underline">
            {ticket.asset.assetTag} — {ticket.asset.name}
          </Link>
          <StatusBadge status={ticket.asset.status} />
        </span>
      ),
    },
    { label: "ความสำคัญ / Priority", value: <StatusBadge status={ticket.priority} /> },
    { label: "สถานะ / Status", value: <StatusBadge status={ticket.status} /> },
    { label: "ผู้แจ้ง / Reported by", value: reporter?.name ?? "-" },
    {
      label: "ช่าง / Technician",
      value: technician
        ? `${technician.firstName} ${technician.lastName} (${technician.employeeCode})`
        : "-",
    },
    {
      label: "ผู้จำหน่าย / Vendor",
      value: ticket.vendor ? (
        <Link href={`/vendors/${ticket.vendor.id}`} className="text-primary hover:underline">
          {ticket.vendor.name}
        </Link>
      ) : (
        "-"
      ),
    },
    { label: "ค่าซ่อม / Repair cost", value: formatMoney(ticket.repairCost) },
    { label: "แจ้งเมื่อ / Created", value: formatDateTime(ticket.createdAt) },
    { label: "เริ่มซ่อม / Started", value: formatDateTime(ticket.startedAt) },
    { label: "เสร็จเมื่อ / Completed", value: formatDateTime(ticket.completedAt) },
  ];

  return (
    <div>
      <PageHeader
        title={`ใบแจ้งซ่อม ${ticket.ticketNumber}`}
        description="รายละเอียดงานแจ้งซ่อม / Maintenance ticket detail"
      >
        <Button variant="outline" asChild>
          <Link href="/maintenance">กลับ / Back</Link>
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ข้อมูลใบแจ้งซ่อม / Ticket info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {info.map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
                  <dd className="text-right font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 space-y-3 border-t pt-3 text-sm">
              <div>
                <p className="mb-1 text-muted-foreground">ปัญหา / Problem</p>
                <p className="whitespace-pre-wrap">{ticket.problem}</p>
              </div>
              {ticket.diagnosis && (
                <div>
                  <p className="mb-1 text-muted-foreground">การวินิจฉัย / Diagnosis</p>
                  <p className="whitespace-pre-wrap">{ticket.diagnosis}</p>
                </div>
              )}
              {ticket.parts && (
                <div>
                  <p className="mb-1 text-muted-foreground">อะไหล่ / Parts</p>
                  <p className="whitespace-pre-wrap">{ticket.parts}</p>
                </div>
              )}
              {ticket.remark && (
                <div>
                  <p className="mb-1 text-muted-foreground">หมายเหตุ / Remark</p>
                  <p className="whitespace-pre-wrap">{ticket.remark}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle>อัปเดตสถานะ / Update status</CardTitle>
            </CardHeader>
            <CardContent>
              {isClosed && (
                <p className="mb-3 text-sm text-muted-foreground">
                  งานนี้ปิดแล้ว แต่ยังสามารถแก้ไขรายละเอียดได้ / This ticket is closed; details can
                  still be amended.
                </p>
              )}
              <form action={updateTicket.bind(null, ticket.id)} className="grid gap-4">
                <div>
                  <Label htmlFor="status">สถานะใหม่ / New status *</Label>
                  <Select id="status" name="status" required className="mt-1" defaultValue={ticket.status}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll("_", " ")}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="diagnosis">การวินิจฉัย / Diagnosis</Label>
                  <Textarea
                    id="diagnosis"
                    name="diagnosis"
                    rows={3}
                    defaultValue={ticket.diagnosis ?? ""}
                    className="mt-1"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="repairCost">ค่าซ่อม / Repair cost (฿)</Label>
                    <Input
                      id="repairCost"
                      name="repairCost"
                      type="number"
                      step="0.01"
                      min={0}
                      defaultValue={ticket.repairCost !== null ? Number(ticket.repairCost) : ""}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="parts">อะไหล่ / Parts</Label>
                    <Input id="parts" name="parts" maxLength={500} defaultValue={ticket.parts ?? ""} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="remark">หมายเหตุ / Remark</Label>
                  <Input id="remark" name="remark" maxLength={500} defaultValue={ticket.remark ?? ""} className="mt-1" />
                </div>
                <div>
                  <Button type="submit">บันทึก / Save</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
