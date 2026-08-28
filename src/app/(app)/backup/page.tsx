import { DatabaseBackup, Plus, ShieldCheck, Trash2, AlertTriangle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { createBackupJob, recordRun, recordRestoreTest, deleteBackupJob } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  OK: "success", WARNING: "warning", FAILED: "destructive", NOT_RUN: "secondary",
};
const fmt = (d: Date | null) => (d ? d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const STALE_HOURS = 48;

export default async function BackupPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("backup:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึงหน้านี้ / No access.</div>;
  }
  const canManage = user.permissions.has("backup:manage");
  const orgId = user.organizationId;
  const now = Date.now();

  const jobs = await prisma.backupJob.findMany({ where: { organizationId: orgId, deletedAt: null }, orderBy: { system: "asc" } });
  const failed = jobs.filter((j) => j.lastStatus === "FAILED").length;
  const stale = jobs.filter((j) => !j.lastRunAt || now - j.lastRunAt.getTime() > STALE_HOURS * 3_600_000).length;
  const untested = jobs.filter((j) => !j.lastRestoreTestAt).length;

  return (
    <div>
      <PageHeader title="สำรองข้อมูล & กู้คืน / Backup & DR" description="สถานะงานสำรองข้อมูล · RPO/RTO · ผลทดสอบการกู้คืน (restore test)" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ทั้งหมด / Jobs</p><p className="text-2xl font-semibold">{jobs.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ล้มเหลว / Failed</p><p className="text-2xl font-semibold text-red-600">{failed}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ไม่ได้รันเกิน 48ชม.</p><p className="text-2xl font-semibold text-amber-600">{stale}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">ยังไม่ทดสอบกู้คืน</p><p className="text-2xl font-semibold text-amber-600">{untested}</p></CardContent></Card>
      </div>

      {(failed > 0 || untested > 0) && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>การสำรองข้อมูลจะยังไม่ถือว่าใช้ได้จนกว่าจะทดสอบกู้คืนสำเร็จ — มี {untested} งานที่ยังไม่เคยทดสอบ และ {failed} งานที่ล้มเหลว</span>
        </div>
      )}

      {canManage && (
        <Card className="mb-4">
          <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Plus className="h-4 w-4 text-primary" /> เพิ่มงานสำรองข้อมูล / Add backup job</CardTitle></CardHeader>
          <CardContent>
            <form action={createBackupJob} className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2"><Label htmlFor="system">ระบบ / System *</Label><Input id="system" name="system" required maxLength={200} className="mt-1" placeholder="Synology NAS · SQL Server ..." /></div>
              <div><Label htmlFor="backupType">ชนิด / Type *</Label><Select id="backupType" name="backupType" required defaultValue="FULL" className="mt-1">{["FULL", "INCREMENTAL", "DIFFERENTIAL", "SNAPSHOT"].map((t) => <option key={t} value={t}>{t}</option>)}</Select></div>
              <div><Label htmlFor="schedule">ตารางเวลา / Schedule</Label><Input id="schedule" name="schedule" className="mt-1" placeholder="Daily 02:00" /></div>
              <div><Label htmlFor="storageTarget">ปลายทาง / Storage</Label><Input id="storageTarget" name="storageTarget" className="mt-1" /></div>
              <div><Label htmlFor="retentionDays">เก็บ (วัน) / Retention</Label><Input id="retentionDays" name="retentionDays" type="number" min={0} className="mt-1" /></div>
              <div><Label htmlFor="rpoHours">RPO (ชม.)</Label><Input id="rpoHours" name="rpoHours" type="number" min={0} className="mt-1" /></div>
              <div><Label htmlFor="rtoHours">RTO (ชม.)</Label><Input id="rtoHours" name="rtoHours" type="number" min={0} className="mt-1" /></div>
              <div><Label htmlFor="owner">ผู้ดูแล / Owner</Label><Input id="owner" name="owner" className="mt-1" /></div>
              <div className="flex items-end"><Button type="submit" className="w-full"><Plus className="h-4 w-4" /> เพิ่ม</Button></div>
            </form>
          </CardContent>
        </Card>
      )}

        <Table>
          <TableHeader><TableRow>
            <TableHead>ระบบ / System</TableHead><TableHead>ชนิด</TableHead><TableHead>รันล่าสุด</TableHead><TableHead>สถานะ</TableHead>
            <TableHead>RPO/RTO</TableHead><TableHead>ทดสอบกู้คืน</TableHead>{canManage && <TableHead>บันทึกผล / Record</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {jobs.length === 0 && <TableRow><TableCell colSpan={canManage ? 7 : 6} className="py-8 text-center text-muted-foreground">ยังไม่มีงานสำรองข้อมูล / No backup jobs</TableCell></TableRow>}
            {jobs.map((j) => {
              const isStale = !j.lastRunAt || now - j.lastRunAt.getTime() > STALE_HOURS * 3_600_000;
              return (
                <TableRow key={j.id}>
                  <TableCell className="font-medium"><span className="flex items-center gap-2"><DatabaseBackup className="h-3.5 w-3.5 text-muted-foreground" />{j.system}</span>{j.schedule && <span className="block text-xs text-muted-foreground">{j.schedule}</span>}</TableCell>
                  <TableCell className="text-xs">{j.backupType}</TableCell>
                  <TableCell className="text-xs">{fmt(j.lastRunAt)}{isStale && <span className="block text-amber-600">ค้าง / stale</span>}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[j.lastStatus]}>{j.lastStatus}</Badge></TableCell>
                  <TableCell className="text-xs">{j.rpoHours ?? "-"}h / {j.rtoHours ?? "-"}h</TableCell>
                  <TableCell className="text-xs">{j.lastRestoreTestAt ? <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald-600" />{j.restoreResult ?? "tested"}<span className="block text-muted-foreground">{fmt(j.lastRestoreTestAt)}</span></span> : <span className="text-amber-600">ยังไม่ทดสอบ</span>}</TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <form action={recordRun.bind(null, j.id)} className="flex items-center gap-1">
                          <Select name="status" defaultValue="OK" className="h-7 w-24 text-xs">{["OK", "WARNING", "FAILED"].map((s) => <option key={s} value={s}>{s}</option>)}</Select>
                          <Button type="submit" size="sm" variant="outline" className="h-7 text-xs">รัน</Button>
                        </form>
                        <form action={recordRestoreTest.bind(null, j.id)} className="flex items-center gap-1">
                          <Select name="result" defaultValue="PASS" className="h-7 w-20 text-xs"><option value="PASS">PASS</option><option value="FAIL">FAIL</option></Select>
                          <Button type="submit" size="sm" variant="outline" className="h-7 text-xs">Restore test</Button>
                        </form>
                        <form action={deleteBackupJob}><input type="hidden" name="id" value={j.id} /><Button type="submit" size="sm" variant="ghost" className="h-7 text-muted-foreground hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button></form>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
    </div>
  );
}
