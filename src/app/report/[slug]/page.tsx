import Link from "next/link";
import { CheckCircle2, LifeBuoy } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { IMPACT_LABEL } from "@/lib/services/support";
import type { CaseImpact } from "@prisma/client";
import { submitPublicCaseAction } from "./actions";
import { EmployeeGate } from "./employee-gate";

export const dynamic = "force-dynamic";

const IMPACT_ORDER: CaseImpact[] = ["UNUSABLE", "MAJOR", "PARTIAL", "GENERAL"];

const ERRORS: Record<string, string> = {
  invalid: "กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง / Some fields are missing or invalid.",
  rate: "คุณส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่ / Too many requests. Please try again later.",
  notfound: "ไม่พบองค์กรนี้ / Organization not found.",
  employee:
    "ไม่พบรหัสพนักงานนี้ หรือพนักงานไม่อยู่ในสถานะทำงาน กรุณาตรวจสอบอีกครั้ง / Staff ID not found or not active.",
  failed: "เกิดข้อผิดพลาดในการเปิดเคส กรุณาลองใหม่ / Could not open the case. Please try again.",
};

export default async function PublicReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;

  const org = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });

  const shell = (children: React.ReactNode) => (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-muted/60 to-background px-4 py-10">
      <div className="w-full max-w-xl">{children}</div>
      <p className="mt-6 text-xs text-muted-foreground">Powered by TECHCORE</p>
    </div>
  );

  if (!org) {
    return shell(
      <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold">ไม่พบองค์กร / Organization not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ลิงก์อาจไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ / This link may be invalid.
        </p>
      </div>
    );
  }

  // Success screen
  if (sp.ok) {
    const isReal = sp.ok !== "spam";
    return shell(
      <div className="rounded-2xl border bg-card p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
        <h1 className="mt-3 text-xl font-bold">ส่งเคสสำเร็จ / Case submitted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          ทีม IT ได้รับเรื่องของคุณแล้ว และจะติดต่อกลับตามข้อมูลพนักงานที่บันทึกไว้
          <br />
          Our IT team has received your request and will follow up with you.
        </p>
        {isReal && (
          <p className="mx-auto mt-4 inline-block rounded-lg border bg-muted/50 px-4 py-2 font-mono text-sm">
            เลขที่เคส / Case&nbsp;No.&nbsp;<span className="font-bold">{sp.ok}</span>
          </p>
        )}
        <div className="mt-6">
          <Button asChild variant="outline">
            <Link href={`/report/${slug}`}>เปิดเคสใหม่อีกครั้ง / Submit another</Link>
          </Button>
        </div>
      </div>
    );
  }

  const types = await prisma.caseType.findMany({
    where: { organizationId: org.id, active: true, deletedAt: null },
    select: { id: true, name: true, nameTh: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const err = sp.error ? ERRORS[sp.error] ?? ERRORS.invalid : null;

  return shell(
    <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-primary/5 px-6 py-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LifeBuoy className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-lg font-bold leading-tight">แจ้งปัญหา IT / IT Support</h1>
          <p className="text-sm text-muted-foreground">{org.name}</p>
        </div>
      </div>

      <div className="px-6 py-6">
        {err && (
          <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {err}
          </div>
        )}

        <form action={submitPublicCaseAction} className="space-y-4">
          <input type="hidden" name="slug" value={slug} />
          {/* Honeypot — hidden from humans, tempting to bots. Inline style so it
              stays hidden even if the stylesheet fails to load. */}
          <div
            aria-hidden
            style={{ position: "absolute", left: "-9999px", top: "-9999px", width: 0, height: 0, overflow: "hidden" }}
          >
            <label>
              Company
              <input name="company" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          {/* Identity first: staff ID -> masked name -> confirm. The case fields
              below only appear once the reporter confirms it is them. */}
          <EmployeeGate slug={slug}>

          <div>
            <Label htmlFor="subject">
              เรื่อง / Subject <span className="text-destructive">*</span>
            </Label>
            <Input
              id="subject" name="subject" required minLength={3} maxLength={300} className="mt-1"
              placeholder="สรุปปัญหาสั้น ๆ / Short summary"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="typeId">ประเภท / Type</Label>
              <Select id="typeId" name="typeId" className="mt-1" defaultValue="">
                <option value="">— เลือก (ไม่บังคับ) / Optional —</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>{t.nameTh ?? t.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="impact">ความเร่งด่วน / Impact</Label>
              <Select id="impact" name="impact" className="mt-1" defaultValue="GENERAL">
                {IMPACT_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {IMPACT_LABEL[k].icon} {IMPACT_LABEL[k].th}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="description">
              รายละเอียด / Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="description" name="description" required minLength={10} maxLength={5000} rows={5} className="mt-1"
              placeholder="อธิบายปัญหาที่พบ ขั้นตอนที่ทำ และสิ่งที่คาดหวัง / Describe the issue in detail"
            />
          </div>

          <Button type="submit" className="w-full">ส่งเรื่อง / Submit</Button>
          </EmployeeGate>
          <p className="text-center text-xs text-muted-foreground">
            การส่งแบบฟอร์มถือว่ายินยอมให้เก็บข้อมูลติดต่อเพื่อดำเนินการแก้ไขปัญหา
          </p>
        </form>
      </div>
    </div>
  );
}
