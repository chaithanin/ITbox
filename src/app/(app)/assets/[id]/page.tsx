import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftRight,
  KeyRound,
  Pencil,
  Printer,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDate, formatDateTime, formatMoney, daysUntil, cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { retireAsset, disposeAsset, deleteAsset } from "../actions";
import { AssetDocumentsCard } from "./documents-card";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function InfoRow({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 text-sm", className)}>{value ?? "-"}</dd>
    </div>
  );
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!user.permissions.has("asset:read")) {
    return (
      <p className="text-sm text-muted-foreground">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </p>
    );
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const asset = await prisma.asset.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: {
      category: { select: { name: true } },
      department: { select: { name: true } },
      location: { select: { name: true } },
      vendor: { select: { name: true } },
      history: { orderBy: { createdAt: "desc" }, take: 20 },
      assignments: {
        orderBy: { assignedAt: "desc" },
        take: 20,
        include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      },
      maintenance: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      vaultLinks: {
        include: {
          vaultItem: {
            select: { id: true, name: true, classification: true, username: true, deletedAt: true },
          },
        },
      },
    },
  });
  if (!asset) notFound();

  const openAssignment = asset.assignments.find((a) => a.status === "CHECKED_OUT");
  const holder = openAssignment?.employee;
  const vaultLinks = asset.vaultLinks.filter((l) => !l.vaultItem.deletedAt);
  const warrantyDays = daysUntil(asset.warrantyEnd);
  const has = (p: string) => user.permissions.has(p);

  return (
    <div>
      <PageHeader
        title={`${asset.assetTag} — ${asset.name}`}
        description={[asset.brand, asset.model].filter(Boolean).join(" ") || undefined}
      >
        {has("asset:assign") && asset.status === "AVAILABLE" && (
          <Button asChild>
            <Link href={`/assets/assign?assetId=${asset.id}`}>
              <UserPlus className="h-4 w-4" />
              มอบหมาย / Assign
            </Link>
          </Button>
        )}
        {has("asset:return") && (asset.status === "ASSIGNED" || asset.status === "IN_USE") && (
          <Button asChild>
            <Link href={`/assets/return?assetId=${asset.id}`}>
              <UserMinus className="h-4 w-4" />
              รับคืน / Return
            </Link>
          </Button>
        )}
        {has("asset:transfer") && (
          <Button variant="outline" asChild>
            <Link href={`/assets/transfer?assetId=${asset.id}`}>
              <ArrowLeftRight className="h-4 w-4" />
              โอนย้าย / Transfer
            </Link>
          </Button>
        )}
        {has("asset:update") && (
          <Button variant="outline" asChild>
            <Link href={`/assets/${asset.id}/edit`}>
              <Pencil className="h-4 w-4" />
              แก้ไข / Edit
            </Link>
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>ข้อมูลทรัพย์สิน / Asset Information</CardTitle>
            <StatusBadge status={asset.status} />
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <InfoRow label="แท็ก / Asset Tag" value={asset.assetTag} />
              <InfoRow label="ชื่อ / Name" value={asset.name} />
              <InfoRow label="ซีเรียล / Serial" value={asset.serialNumber} />
              <InfoRow label="ยี่ห้อ / Brand" value={asset.brand} />
              <InfoRow label="รุ่น / Model" value={asset.model} />
              <InfoRow label="หมวดหมู่ / Category" value={asset.category?.name} />
              <InfoRow label="สภาพ / Condition" value={asset.condition} />
              <InfoRow label="แผนก / Department" value={asset.department?.name} />
              <InfoRow label="สถานที่ / Location" value={asset.location?.name} />
              <InfoRow label="ผู้ขาย / Vendor" value={asset.vendor?.name} />
              <InfoRow
                label="ผู้ถือครอง / Assigned To"
                value={holder ? `${holder.firstName} ${holder.lastName} (${holder.employeeCode})` : null}
              />
              <InfoRow label="ผู้ดูแล / Custodian" value={asset.custodian} />
              <InfoRow label="วันที่ซื้อ / Purchase Date" value={formatDate(asset.purchaseDate)} />
              <InfoRow
                label="ราคาซื้อ / Purchase Price"
                value={asset.purchasePrice != null ? `฿ ${formatMoney(Number(asset.purchasePrice))}` : "-"}
              />
              <InfoRow
                label="มูลค่าปัจจุบัน / Current Value"
                value={asset.currentValue != null ? `฿ ${formatMoney(Number(asset.currentValue))}` : "-"}
              />
              <InfoRow label="ใบแจ้งหนี้ / Invoice" value={asset.invoiceNumber} />
              <InfoRow label="เริ่มประกัน / Warranty Start" value={formatDate(asset.warrantyStart)} />
              <InfoRow
                label="หมดประกัน / Warranty End"
                value={
                  <>
                    {formatDate(asset.warrantyEnd)}
                    {warrantyDays !== null && warrantyDays >= 0 && warrantyDays < 30 && (
                      <span className="ml-1 text-xs">({warrantyDays} วัน / days)</span>
                    )}
                  </>
                }
                className={cn(
                  warrantyDays !== null && warrantyDays < 0 && "text-destructive",
                  warrantyDays !== null &&
                    warrantyDays >= 0 &&
                    warrantyDays < 30 &&
                    "text-amber-600 dark:text-amber-400"
                )}
              />
              <InfoRow label="ศูนย์ต้นทุน / Cost Center" value={asset.costCenter} />
              <InfoRow label="โครงการ / Project" value={asset.project} />
              <InfoRow label="IP Address" value={asset.ipAddress} />
              <InfoRow label="สร้างเมื่อ / Created" value={formatDateTime(asset.createdAt)} />
              <InfoRow label="แก้ไขล่าสุด / Updated" value={formatDateTime(asset.updatedAt)} />
            </dl>
            {asset.specification && (
              <div className="mt-4">
                <InfoRow
                  label="สเปค / Specification"
                  value={<span className="whitespace-pre-wrap">{asset.specification}</span>}
                />
              </div>
            )}
            {asset.notes && (
              <div className="mt-4">
                <InfoRow
                  label="หมายเหตุ / Notes"
                  value={<span className="whitespace-pre-wrap">{asset.notes}</span>}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QR Code</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/assets/${asset.id}/qr`} alt={`QR ${asset.assetTag}`} className="h-40 w-40" />
            <Link href={`/scan/${asset.id}`} className="text-sm text-primary hover:underline">
              /scan/{asset.id.slice(0, 8)}…
            </Link>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/assets/${asset.id}/sticker`}>
                <Printer className="h-4 w-4" />
                พิมพ์สติกเกอร์ / Print sticker
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ประวัติ / History</CardTitle>
          </CardHeader>
          <CardContent>
            {asset.history.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีประวัติ / No history yet</p>
            ) : (
              <ul className="space-y-3">
                {asset.history.map((h) => (
                  <li key={h.id} className="flex items-start gap-3 text-sm">
                    <Badge variant="outline">{h.action}</Badge>
                    <div>
                      <p>{h.detail ?? "-"}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>การมอบหมาย / Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {asset.assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีการมอบหมาย / No assignments yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>พนักงาน / Employee</TableHead>
                    <TableHead>สถานะ / Status</TableHead>
                    <TableHead>วันที่มอบหมาย / Assigned</TableHead>
                    <TableHead>วันที่คืน / Returned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {asset.assignments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        {a.employee.firstName} {a.employee.lastName}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell>{formatDate(a.assignedAt)}</TableCell>
                      <TableCell>{formatDate(a.returnedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>การซ่อม / Maintenance Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            {asset.maintenance.length === 0 ? (
              <p className="text-sm text-muted-foreground">ยังไม่มีงานซ่อม / No maintenance tickets</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เลขที่ / Ticket</TableHead>
                    <TableHead>ปัญหา / Problem</TableHead>
                    <TableHead>ความสำคัญ / Priority</TableHead>
                    <TableHead>สถานะ / Status</TableHead>
                    <TableHead>วันที่ / Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {asset.maintenance.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.ticketNumber}</TableCell>
                      <TableCell>{m.problem}</TableCell>
                      <TableCell>
                        <StatusBadge status={m.priority} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={m.status} />
                      </TableCell>
                      <TableCell>{formatDate(m.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Credentials ที่เชื่อมโยง / Linked Secrets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {vaultLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                ไม่มี credential ที่เชื่อมโยง / No linked secrets
              </p>
            ) : (
              <ul className="space-y-3">
                {vaultLinks.map((l) => (
                  <li key={l.vaultItemId} className="flex flex-wrap items-center gap-2 text-sm">
                    <Link href={`/vault/${l.vaultItem.id}`} className="font-medium text-primary hover:underline">
                      {l.vaultItem.name}
                    </Link>
                    <StatusBadge status={l.vaultItem.classification} />
                    {l.label && <span className="text-muted-foreground">{l.label}</span>}
                    {l.vaultItem.username && (
                      <span className="text-muted-foreground">({l.vaultItem.username})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <AssetDocumentsCard
          assetId={asset.id}
          organizationId={user.organizationId}
          canEdit={has("asset:update")}
        />
      </div>

      {(has("asset:dispose") || has("asset:delete")) && (
        <Card className="mt-4 border-destructive/40">
          <CardHeader>
            <CardTitle>การจัดการสถานะ / Lifecycle Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {has("asset:dispose") && asset.status !== "DISPOSED" && (
              <>
                {asset.status !== "RETIRED" && (
                  <form action={retireAsset}>
                    <input type="hidden" name="id" value={asset.id} />
                    <ConfirmButton
                      variant="outline"
                      confirmText="ยืนยันปลดระวางทรัพย์สินนี้? / Retire this asset?"
                    >
                      ปลดระวาง / Retire
                    </ConfirmButton>
                  </form>
                )}
                <form action={disposeAsset}>
                  <input type="hidden" name="id" value={asset.id} />
                  <ConfirmButton
                    variant="destructive"
                    confirmText="ยืนยันจำหน่ายทรัพย์สินนี้ออก? / Dispose this asset?"
                  >
                    จำหน่ายออก / Dispose
                  </ConfirmButton>
                </form>
              </>
            )}
            {has("asset:delete") && (
              <form action={deleteAsset}>
                <input type="hidden" name="id" value={asset.id} />
                <ConfirmButton
                  variant="destructive"
                  confirmText="ยืนยันลบทรัพย์สินนี้? / Delete this asset?"
                >
                  ลบ / Delete
                </ConfirmButton>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
