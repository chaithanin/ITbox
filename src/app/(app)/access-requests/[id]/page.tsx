import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { setRequestStatus, setItemProvision } from "../actions";

const REQ_STATUS = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PROVISIONED", "REVOKED"];
const PROV_STATUS = ["PENDING", "ACCOUNT_CREATED", "ACCESS_GRANTED", "FAILED", "REVOKED"];
const SOURCE_LABEL: Record<string, string> = { DEFAULT: "Default", ADDITIONAL: "Additional", RESTRICTED: "Restricted" };

export default async function AccessRequestDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("accessreq:read");
  const { id } = await params;
  const sp = await searchParams;
  const canManage = user.permissions.has("accessreq:manage");

  const r = await prisma.accessRequest.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    include: { items: { orderBy: { source: "asc" } } },
  });
  if (!r) notFound();
  const setStatus = setRequestStatus.bind(null, r.id);
  const setProv = setItemProvision.bind(null, r.id);

  return (
    <div className="mx-auto max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/access-requests"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title={`คำขอสิทธิ์ — ${r.nameEn || r.nameTh || r.employeeCode || ""}`} description={[r.department, r.position, r.jobLevel].filter(Boolean).join(" · ")}>
        <StatusBadge status={r.status} />
      </PageHeader>

      {sp.ok === "submitted" && <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">ส่งคำขอเรียบร้อย / Request submitted</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">สิทธิ์ที่ขอ / Requested Access</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>ระบบ / System</TableHead><TableHead>ระดับ / Level</TableHead>
                <TableHead>ที่มา / Source</TableHead><TableHead>Provisioning</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {r.items.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">ไม่มีรายการ</TableCell></TableRow>}
                {r.items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.system}{it.resource ? <span className="text-muted-foreground"> ({it.resource})</span> : null}</TableCell>
                    <TableCell>{it.permissionLevel}</TableCell>
                    <TableCell><span className="rounded border px-1.5 py-0.5 text-xs text-muted-foreground">{SOURCE_LABEL[it.source] ?? it.source}</span></TableCell>
                    <TableCell>
                      {canManage ? (
                        <form action={setProv} className="flex items-center gap-1">
                          <input type="hidden" name="itemId" value={it.id} />
                          <Select name="provisionStatus" defaultValue={it.provisionStatus} className="h-8">
                            {PROV_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </Select>
                          <Button type="submit" size="sm" variant="outline" className="h-8">✓</Button>
                        </form>
                      ) : <StatusBadge status={it.provisionStatus} />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {r.businessJustification && <p className="mt-3 text-sm"><span className="font-medium">เหตุผล / Justification:</span> {r.businessJustification}</p>}
            {r.approvalChain && <p className="mt-1 text-sm text-muted-foreground"><span className="font-medium">สายอนุมัติ:</span> {r.approvalChain}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">ข้อมูล / Details</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><span className="text-muted-foreground">รหัส:</span> {r.employeeCode ?? "—"}</p>
            <p><span className="text-muted-foreground">บริษัท:</span> {r.company ?? "—"}</p>
            <p><span className="text-muted-foreground">โทร:</span> {r.phone ?? "—"}</p>
            <p><span className="text-muted-foreground">อีเมล:</span> {r.email ?? "—"}</p>
            <p><span className="text-muted-foreground">มีผล:</span> {r.effectiveDate ? formatDate(r.effectiveDate) : "—"}</p>
            <p><span className="text-muted-foreground">หมดอายุ:</span> {r.expiryDate ? formatDate(r.expiryDate) : "—"}</p>
            {canManage && (
              <form action={setStatus} className="mt-3 flex items-center gap-2 border-t pt-3">
                <Select name="status" defaultValue={r.status} className="h-8">
                  {REQ_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Button type="submit" size="sm">อัปเดต</Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
