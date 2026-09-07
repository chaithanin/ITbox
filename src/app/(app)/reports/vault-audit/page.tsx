import Link from "next/link";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { ReportHeader, ExecutiveSummary, ChartCard, AlertList, type AlertEntry } from "@/components/report/ui";
import { HBars } from "@/components/charts";
import { getVaultAudit } from "@/lib/services/reports";

export const dynamic = "force-dynamic";

/** Mask an IP so only the last octet shows (e.g. ***.***.***.42). */
function maskIp(ip: string): string {
  const parts = ip.split(".");
  if (parts.length === 4) return `***.***.***.${parts[3]}`;
  if (ip.length <= 4) return "*".repeat(ip.length);
  return `****${ip.slice(-4)}`;
}

export default async function VaultAuditDashboard() {
  const user = await requirePermission("audit:read");
  const v = await getVaultAudit(user.organizationId, 30);

  const actionRows = Object.entries(v.byAction).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  const failRate = v.total > 0 ? Math.round((v.failed / v.total) * 100) : 0;

  const alerts: AlertEntry[] = [];
  if (v.failed > 0) alerts.push({ severity: v.failed >= 5 ? "critical" : "warning", title: "การเข้าถึงถูกปฏิเสธ / Failed access attempts", count: v.failed, detail: `อัตราล้มเหลว ${failRate}% ใน 30 วัน` });
  if (v.offHoursCount > 0) alerts.push({ severity: "warning", title: "เข้าถึงนอกเวลาทำการ / Off-hours access (ก่อน 07:00 หรือหลัง 20:00)", count: v.offHoursCount });
  const heavyIp = v.topIps.find((i) => i.count >= 50);
  if (heavyIp) alerts.push({ severity: "info", title: `IP เดียวเข้าถึงถี่ / High activity from one IP (${maskIp(heavyIp.ip)})`, count: heavyIp.count });

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/reports"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link></Button>
      <PageHeader title="ตรวจสอบความปลอดภัย Vault / Security & Vault Audit" description="เมทาดาทาการเข้าถึงเท่านั้น — ไม่มีรหัสผ่าน/คีย์/โทเคนใด ๆ">
        <Button variant="outline" asChild><a href="/api/reports/vault-access?format=xlsx"><Download className="h-4 w-4" /> Excel</a></Button>
      </PageHeader>
      <ReportHeader reportName="Vault Access Audit (last 30 days)" generatedBy={user.name} />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <p>รายงานนี้แสดงเฉพาะ <b>เมทาดาทา</b> (เวลา, ผู้ใช้, การกระทำ, ผล, IP ที่ปิดบัง) — <b>ไม่มี</b>ค่าความลับ รหัสผ่าน API key หรือ token ปรากฏเด็ดขาด</p>
      </div>

      <ExecutiveSummary>
        ใน 30 วันที่ผ่านมามีเหตุการณ์เข้าถึง Vault <b>{v.total.toLocaleString()}</b> ครั้ง — สำเร็จ {v.success}, ล้มเหลว <b className={v.failed > 0 ? "text-destructive" : ""}>{v.failed}</b> ({failRate}%).
        อ่านความลับ {v.readSecret}, สร้าง {v.createSecret}, แก้ไข/หมุนคีย์ {v.updateSecret}, ลบ {v.deleteSecret}.
        {v.offHoursCount > 0 ? ` มีการเข้าถึงนอกเวลาทำการ ${v.offHoursCount} ครั้ง ควรตรวจสอบ` : " ไม่พบการเข้าถึงนอกเวลาผิดปกติ"}
      </ExecutiveSummary>

      <div className="mb-4 grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="เหตุการณ์ / Events" value={v.total} />
        <StatCard label="สำเร็จ / Success" value={v.success} tone="success" />
        <StatCard label="ล้มเหลว / Failed" value={v.failed} tone={v.failed > 0 ? "danger" : "default"} />
        <StatCard label="สร้าง / Create" value={v.createSecret} />
        <StatCard label="อ่าน / Read" value={v.readSecret} />
        <StatCard label="แก้ไข / Update" value={v.updateSecret} />
        <StatCard label="ลบ / Delete" value={v.deleteSecret} tone={v.deleteSecret > 0 ? "warning" : "default"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="ตามประเภทการกระทำ / By Action">{actionRows.length ? <HBars rows={actionRows} /> : <p className="text-sm text-muted-foreground">ไม่มีข้อมูล</p>}</ChartCard>
        <ChartCard title="การแจ้งเตือนความปลอดภัย / Security Alerts"><AlertList alerts={alerts} emptyText="ไม่พบความผิดปกติ / No anomalies detected" /></ChartCard>
        <ChartCard title="IP ที่เข้าถึงบ่อย (ปิดบัง) / Top IPs (masked)" className="lg:col-span-2">
          {v.topIps.length ? (
            <ul className="space-y-1.5 text-sm">
              {v.topIps.map((i) => (
                <li key={i.ip} className="flex items-center justify-between rounded-md border p-2">
                  <span className="font-mono">{maskIp(i.ip)}</span>
                  <span className="tabular-nums text-muted-foreground">{i.count.toLocaleString()} ครั้ง / events</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">ไม่มีข้อมูล IP</p>}
        </ChartCard>
      </div>
    </div>
  );
}
