import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Star } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmButton } from "@/components/confirm-button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/utils";
import { deleteVendor } from "../actions";

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("vendor:read")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เข้าถึงหน้านี้ / You do not have access to this page.
      </div>
    );
  }

  const vendor = await prisma.vendor.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
  });
  if (!vendor) notFound();

  const [purchases, assets, tickets] = await Promise.all([
    prisma.purchaseRequest.findMany({
      where: { vendorId: id, organizationId: user.organizationId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.asset.findMany({
      where: { vendorId: id, organizationId: user.organizationId, deletedAt: null },
      select: { id: true, assetTag: true, name: true, status: true, purchaseDate: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.maintenanceTicket.findMany({
      where: { vendorId: id, organizationId: user.organizationId, deletedAt: null },
      select: {
        id: true,
        ticketNumber: true,
        problem: true,
        status: true,
        repairCost: true,
        createdAt: true,
        asset: { select: { assetTag: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const canManage = user.permissions.has("vendor:manage");

  const info: { label: string; value: React.ReactNode }[] = [
    { label: "ผู้ติดต่อ / Contact", value: vendor.contactName ?? "-" },
    { label: "โทรศัพท์ / Phone", value: vendor.phone ?? "-" },
    { label: "อีเมล / Email", value: vendor.email ?? "-" },
    { label: "เลขผู้เสียภาษี / Tax ID", value: vendor.taxId ?? "-" },
    { label: "หมวดหมู่ / Category", value: vendor.category ?? "-" },
    {
      label: "คะแนน / Rating",
      value: vendor.rating ? (
        <span className="flex items-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={
                i < (vendor.rating ?? 0)
                  ? "h-3.5 w-3.5 fill-amber-400 text-amber-400"
                  : "h-3.5 w-3.5 text-muted-foreground/40"
              }
            />
          ))}
        </span>
      ) : (
        "-"
      ),
    },
    { label: "ที่อยู่ / Address", value: vendor.address ?? "-" },
  ];

  return (
    <div>
      <PageHeader title={vendor.name} description="รายละเอียดผู้จำหน่าย / Vendor detail">
        {canManage && (
          <>
            <Button variant="outline" asChild>
              <Link href={`/vendors/${vendor.id}/edit`}>
                <Pencil className="h-4 w-4" /> แก้ไข / Edit
              </Link>
            </Button>
            <form action={deleteVendor.bind(null, vendor.id)}>
              <ConfirmButton variant="destructive" confirmText="ลบผู้จำหน่ายนี้? / Delete this vendor?">
                ลบ / Delete
              </ConfirmButton>
            </form>
          </>
        )}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>ข้อมูลผู้จำหน่าย / Vendor info</CardTitle>
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
            {vendor.notes && (
              <div className="mt-4 border-t pt-3 text-sm">
                <p className="mb-1 text-muted-foreground">หมายเหตุ / Notes</p>
                <p className="whitespace-pre-wrap">{vendor.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Tabs defaultValue="purchases">
            <TabsList>
              <TabsTrigger value="purchases">
                จัดซื้อ / Purchases ({purchases.length})
              </TabsTrigger>
              <TabsTrigger value="assets">ทรัพย์สิน / Assets ({assets.length})</TabsTrigger>
              <TabsTrigger value="maintenance">
                งานซ่อม / Maintenance ({tickets.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="purchases">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เลขที่ / Request #</TableHead>
                    <TableHead>สถานะ / Status</TableHead>
                    <TableHead>ยอดประมาณ / Estimated</TableHead>
                    <TableHead>วันที่ / Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        ไม่มีประวัติการจัดซื้อ / No purchase history
                      </TableCell>
                    </TableRow>
                  )}
                  {purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/procurement/${p.id}`} className="font-medium text-primary hover:underline">
                          {p.requestNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="tabular-nums">{formatMoney(p.totalEstimated)}</TableCell>
                      <TableCell>{formatDate(p.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="assets">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>รหัส / Tag</TableHead>
                    <TableHead>ชื่อ / Name</TableHead>
                    <TableHead>สถานะ / Status</TableHead>
                    <TableHead>วันที่ซื้อ / Purchased</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        ไม่มีทรัพย์สินจากผู้จำหน่ายนี้ / No assets supplied by this vendor
                      </TableCell>
                    </TableRow>
                  )}
                  {assets.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link href={`/assets/${a.id}`} className="font-medium text-primary hover:underline">
                          {a.assetTag}
                        </Link>
                      </TableCell>
                      <TableCell>{a.name}</TableCell>
                      <TableCell>
                        <StatusBadge status={a.status} />
                      </TableCell>
                      <TableCell>{formatDate(a.purchaseDate)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="maintenance">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เลขที่ / Ticket #</TableHead>
                    <TableHead>ทรัพย์สิน / Asset</TableHead>
                    <TableHead>ปัญหา / Problem</TableHead>
                    <TableHead>สถานะ / Status</TableHead>
                    <TableHead>ค่าซ่อม / Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        ไม่มีงานซ่อมกับผู้จำหน่ายนี้ / No maintenance jobs with this vendor
                      </TableCell>
                    </TableRow>
                  )}
                  {tickets.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link href={`/maintenance/${t.id}`} className="font-medium text-primary hover:underline">
                          {t.ticketNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {t.asset.assetTag} — {t.asset.name}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate">{t.problem}</TableCell>
                      <TableCell>
                        <StatusBadge status={t.status} />
                      </TableCell>
                      <TableCell className="tabular-nums">{formatMoney(t.repairCost)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
