import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft, KeyRound, PlugZap } from "lucide-react";
import { requirePermission } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { generateIngestKeyAction, revokeIngestKeyAction } from "./actions";

export const dynamic = "force-dynamic";

const MSG: Record<string, { text: string; error?: boolean }> = {
  generated: { text: "สร้าง API key ใหม่แล้ว — คัดลอกเก็บไว้ทันที (แสดงครั้งเดียว)", error: false },
  revoked: { text: "ยกเลิก API key แล้ว", error: false },
};

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requirePermission("settings:manage");
  const sp = await searchParams;
  const msg = MSG[sp.ok ?? ""];

  const setting = await prisma.systemSetting.findFirst({
    where: { organizationId: user.organizationId, key: "itreport.ingest" },
    select: { value: true, updatedAt: true },
  });
  const v = (setting?.value ?? null) as { keyPrefix?: string; createdAt?: string; createdBy?: string } | null;
  const newKey = (await cookies()).get("itreport_newkey")?.value ?? null;

  return (
    <div>
      <PageHeader
        title="การเชื่อมต่อ / Integrations"
        description="API key สำหรับตัวเก็บข้อมูล (Collector) ส่งสถานะ Server/Backup/Storage เข้า IT Support Report อัตโนมัติ"
      >
        <Button variant="outline" asChild>
          <Link href="/settings"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link>
        </Button>
      </PageHeader>

      {msg && <p className="mb-4 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">{msg.text}</p>}

      {newKey && (
        <Card className="mb-4 border-emerald-500/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-emerald-700 dark:text-emerald-400">🔑 API Key ใหม่ (แสดงครั้งเดียว)</CardTitle></CardHeader>
          <CardContent>
            <code className="block break-all rounded-md bg-muted p-3 font-mono text-sm">{newKey}</code>
            <p className="mt-2 text-xs text-muted-foreground">คัดลอกไปตั้งค่าในสคริปต์ Collector (ตัวแปร TECHCORE_KEY) — จะไม่แสดงอีกหลังออกจากหน้านี้</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><KeyRound className="h-4 w-4 text-primary" /> Ingest API Key</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {v ? (
              <div className="text-sm">
                <p className="flex items-center gap-2"><Badge variant="success">ตั้งค่าแล้ว / Configured</Badge> <span className="font-mono text-xs text-muted-foreground">{v.keyPrefix}…</span></p>
                <p className="mt-1 text-xs text-muted-foreground">สร้างเมื่อ {v.createdAt ? new Date(v.createdAt).toLocaleString("th-TH") : "-"} · โดย {v.createdBy ?? "-"}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">ยังไม่มี API key — กดสร้างเพื่อเริ่มเชื่อมต่อ Collector</p>
            )}
            <div className="flex flex-wrap gap-2">
              <form action={generateIngestKeyAction}>
                <Button type="submit">{v ? "สร้างใหม่ (Rotate)" : "สร้าง API Key"}</Button>
              </form>
              {v && (
                <form action={revokeIngestKeyAction}>
                  <ConfirmButton variant="outline" confirmText="ยกเลิก API key นี้? Collector จะส่งข้อมูลไม่ได้จนกว่าจะสร้างใหม่">ยกเลิก / Revoke</ConfirmButton>
                </form>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><PlugZap className="h-4 w-4 text-sky-600" /> Endpoint & Synology Collector</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Ingest URL (POST)</p>
              <code className="mt-1 block break-all rounded-md bg-muted p-2 font-mono text-xs">https://&lt;โดเมนของคุณ&gt;/api/it-report/ingest</code>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Header</p>
              <code className="mt-1 block break-all rounded-md bg-muted p-2 font-mono text-xs">Authorization: Bearer &lt;API_KEY&gt;</code>
            </div>
            <p className="text-xs text-muted-foreground">
              รันสคริปต์ Collector <span className="font-mono">techcore_synology_collector.py</span> ในเครื่องที่อยู่ในเครือข่ายเดียวกับ NAS
              (ตั้ง Task Scheduler ของ DSM หรือ cron รายวัน) — มันจะล็อกอิน DSM ดึงสถานะ Active Backup for Business + Storage แล้วส่งเข้ามาให้อัตโนมัติ
              เป็น mode <span className="font-mono">AUTO</span> (🟢)
            </p>
            <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
              <li>สร้าง/คัดลอก API key ทางซ้าย</li>
              <li>ตั้งค่าในสคริปต์: DSM host/user/pass, TECHCORE_URL, TECHCORE_KEY</li>
              <li>ตั้ง DSM → Control Panel → Task Scheduler รันสคริปต์รายวัน (เช่น 08:00)</li>
              <li>เปิด IT Support Report จะเห็น Backup/Storage อัปเดตอัตโนมัติ + Storage Forecast</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><PlugZap className="h-4 w-4 text-emerald-600" /> เชื่อมข้อมูลพนักงานจาก HR / ATS (Push)</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              ระบบ HR Intelligence &amp; ATS เป็นแหล่งข้อมูลหลักของพนักงาน — ให้ HR ยิงรายชื่อพนักงานปัจจุบันเข้ามา TECHCORE จะ upsert ให้อัตโนมัติ (คนเข้าใหม่ → สร้าง, ย้ายแผนก/ตำแหน่ง → อัปเดต + แจ้งทบทวนสิทธิ์, ลาออก → ตั้งสถานะ RESIGNED). ใช้ API key เดียวกับ Collector
            </p>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Endpoint</p>
              <code className="mt-1 block break-all rounded-md bg-muted p-2 font-mono text-xs">POST https://&lt;โดเมน&gt;/api/hr/employees/sync · Authorization: Bearer &lt;API_KEY&gt;</code>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">ตัวอย่าง body</p>
              <code className="mt-1 block whitespace-pre-wrap break-all rounded-md bg-muted p-2 font-mono text-xs">{`{ "employees": [ { "employeeCode": "EMP001", "firstName": "สมชาย", "lastName": "ใจดี", "email": "somchai@...", "position": "Software Engineer", "department": "IT", "location": "HQ", "managerCode": "EMP000", "status": "ACTIVE", "hireDate": "2024-01-15", "terminationDate": null } ] }`}</code>
            </div>
            <p className="text-xs text-muted-foreground">
              สคริปต์พร้อมใช้ (รันในโปรเจกต์ HR-ATS): <span className="font-mono">scripts/hr_ats_to_techcore_sync.mjs</span> — ดึงจาก Prisma ของ HR แล้ว push เข้ามา · แผนก/ตำแหน่ง/หัวหน้า map ให้อัตโนมัติ (แผนกใหม่สร้างให้), สถานะ TERMINATED → RESIGNED
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
