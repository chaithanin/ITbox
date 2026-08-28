import { ShieldAlert, Plus, Trash2 } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { createVulnerability, setVulnStatus, deleteVulnerability } from "./actions";

export const dynamic = "force-dynamic";

const SEV_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  LOW: "secondary", MEDIUM: "warning", HIGH: "destructive", CRITICAL: "destructive",
};
const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  OPEN: "destructive", IN_PROGRESS: "warning", REMEDIATED: "success", ACCEPTED: "secondary", FALSE_POSITIVE: "secondary",
};
const fmt = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-");

export default async function VulnerabilitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("vuln:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const canManage = user.permissions.has("vuln:manage");
  const orgId = user.organizationId;
  const now = new Date();

  const [vulns, assets, sevCounts] = await Promise.all([
    prisma.vulnerability.findMany({ where: { organizationId: orgId, deletedAt: null }, include: { asset: { select: { assetTag: true, name: true } } }, orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }], take: 200 }),
    prisma.asset.findMany({ where: { organizationId: orgId, deletedAt: null, status: { notIn: ["DISPOSED"] } }, select: { id: true, assetTag: true, name: true }, orderBy: { assetTag: "asc" }, take: 500 }),
    prisma.vulnerability.groupBy({ by: ["severity"], where: { organizationId: orgId, deletedAt: null, status: { in: ["OPEN", "IN_PROGRESS"] } }, _count: true }),
  ]);
  const openBy = new Map(sevCounts.map((s) => [s.severity, s._count]));

  return (
    <div>
      <PageHeader title="ช่องโหว่ & แพตช์ / Vulnerabilities" description="ติดตามช่องโหว่ (CVE) ความรุนแรง การแก้ไข (remediation) และสถานะแพตช์" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((s) => (
          <Card key={s}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{s} (open)</p>
            <p className={`text-2xl font-semibold ${s === "CRITICAL" || s === "HIGH" ? "text-red-600" : ""}`}>{openBy.get(s) ?? 0}</p>
          </CardContent></Card>
        ))}
      </div>

      {canManage && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4 text-primary" /> บันทึกช่องโหว่ / Log vulnerability</CardTitle></CardHeader>
          <CardContent>
            <form action={createVulnerability} className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2"><Label htmlFor="title">หัวข้อ / Title *</Label><Input id="title" name="title" required minLength={3} maxLength={300} className="mt-1" /></div>
              <div><Label htmlFor="cveId">CVE ID</Label><Input id="cveId" name="cveId" className="mt-1" placeholder="CVE-2026-1234" /></div>
              <div><Label htmlFor="severity">ความรุนแรง / Severity *</Label><Select id="severity" name="severity" required defaultValue="MEDIUM" className="mt-1">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}</Select></div>
              <div><Label htmlFor="assetId">ทรัพย์สิน / Asset</Label><Select id="assetId" name="assetId" className="mt-1" defaultValue=""><option value="">—</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.assetTag} · {a.name}</option>)}</Select></div>
              <div><Label htmlFor="affectedSystem">ระบบที่กระทบ / System</Label><Input id="affectedSystem" name="affectedSystem" className="mt-1" /></div>
              <div><Label htmlFor="dueDate">กำหนดแก้ / Due date</Label><Input id="dueDate" name="dueDate" type="date" className="mt-1" /></div>
              <div><Label htmlFor="patchVersion">เวอร์ชันแพตช์ / Patch</Label><Input id="patchVersion" name="patchVersion" className="mt-1" /></div>
              <div className="sm:col-span-3"><Label htmlFor="remediation">แนวทางแก้ไข / Remediation</Label><Textarea id="remediation" name="remediation" rows={2} className="mt-1" /></div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" name="patchAvailable" value="on" className="h-3.5 w-3.5" /> มีแพตช์</label>
                <Button type="submit"><Plus className="h-4 w-4" /> บันทึก</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

        <Table>
          <TableHeader><TableRow>
            <TableHead>หัวข้อ / Title</TableHead><TableHead>CVE</TableHead><TableHead>ความรุนแรง</TableHead><TableHead>ทรัพย์สิน</TableHead><TableHead>Patch</TableHead><TableHead>กำหนดแก้</TableHead><TableHead>สถานะ</TableHead>{canManage && <TableHead></TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {vulns.length === 0 && <TableRow><TableCell colSpan={canManage ? 8 : 7} className="py-8 text-center text-muted-foreground">ยังไม่มีรายการ / No vulnerabilities</TableCell></TableRow>}
            {vulns.map((v) => {
              const overdue = v.dueDate && v.dueDate < now && (v.status === "OPEN" || v.status === "IN_PROGRESS");
              return (
                <TableRow key={v.id}>
                  <TableCell className="font-medium"><span className="flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />{v.title}</span>{v.affectedSystem && <span className="block text-xs text-muted-foreground">{v.affectedSystem}</span>}</TableCell>
                  <TableCell className="font-mono text-xs">{v.cveId ?? "-"}</TableCell>
                  <TableCell><Badge variant={SEV_VARIANT[v.severity]}>{v.severity}</Badge></TableCell>
                  <TableCell className="text-xs">{v.asset ? v.asset.assetTag : "-"}</TableCell>
                  <TableCell className="text-xs">{v.patchAvailable ? <Badge variant="success">{v.patchVersion ?? "available"}</Badge> : <span className="text-muted-foreground">-</span>}</TableCell>
                  <TableCell className="text-xs">{fmt(v.dueDate)}{overdue && <span className="block text-red-600">เลยกำหนด</span>}</TableCell>
                  <TableCell>
                    {canManage ? (
                      <form action={setVulnStatus.bind(null, v.id)}>
                        <Select name="status" defaultValue={v.status} className="h-7 w-32 text-xs">{["OPEN", "IN_PROGRESS", "REMEDIATED", "ACCEPTED", "FALSE_POSITIVE"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</Select>
                        <button type="submit" className="mt-1 text-[11px] text-primary hover:underline">อัปเดต</button>
                      </form>
                    ) : <Badge variant={STATUS_VARIANT[v.status]}>{v.status.replace("_", " ")}</Badge>}
                  </TableCell>
                  {canManage && <TableCell><form action={deleteVulnerability}><input type="hidden" name="id" value={v.id} /><Button type="submit" size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button></form></TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
    </div>
  );
}
