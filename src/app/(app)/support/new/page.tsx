import Link from "next/link";
import { LifeBuoy, User2, CircleHelp, Paperclip, ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { IMPACT_LABEL, PRIORITY_LABEL } from "@/lib/services/support";
import type { CaseImpact } from "@prisma/client";
import { createCaseAction } from "../actions";
import { CategoryPicker, type CategoryOption } from "./category-picker";
import { ReporterFields } from "./reporter-fields";
import { DevicePicker } from "./device-picker";

const IMPACT_ORDER: CaseImpact[] = ["UNUSABLE", "MAJOR", "PARTIAL", "GENERAL"];

// Impact → resulting priority + how the option should read/colour on the card.
const IMPACT_META: Record<
  CaseImpact,
  { priority: "P1" | "P2" | "P3" | "P4"; descTh: string; accent: string; dot: string }
> = {
  UNUSABLE: { priority: "P1", descTh: "ทำงานต่อไม่ได้เลย ต้องแก้ด่วน", accent: "text-red-600 dark:text-red-400", dot: "bg-red-500" },
  MAJOR: { priority: "P2", descTh: "กระทบงานสำคัญอย่างมาก", accent: "text-orange-600 dark:text-orange-400", dot: "bg-orange-500" },
  PARTIAL: { priority: "P3", descTh: "ยังพอทำงานได้บางส่วน", accent: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  GENERAL: { priority: "P4", descTh: "สอบถาม/ขอทั่วไป ไม่เร่งด่วน", accent: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500" },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "U";
}

function SectionTitle({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
        {step}
      </span>
      <h3 className="text-sm font-semibold">{children}</h3>
    </div>
  );
}

export default async function NewCasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await requireUser();

  if (!user.permissions.has("support:create")) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        ไม่มีสิทธิ์เปิดเคส / You do not have permission to open a case.
      </div>
    );
  }

  const [types, categories, locations, employee, assignments] = await Promise.all([
    prisma.caseType.findMany({
      where: { organizationId: user.organizationId, active: true, deletedAt: null },
      select: { id: true, name: true, nameTh: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.caseCategory.findMany({
      where: { organizationId: user.organizationId, active: true, deletedAt: null },
      select: { id: true, name: true, nameTh: true, parentId: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.location.findMany({
      where: { organizationId: user.organizationId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    user.employeeId
      ? prisma.employee.findFirst({
          where: { id: user.employeeId, organizationId: user.organizationId },
          include: { department: { select: { name: true } } },
        })
      : null,
    user.employeeId
      ? prisma.assetAssignment.findMany({
          where: {
            organizationId: user.organizationId,
            employeeId: user.employeeId,
            status: "CHECKED_OUT",
          },
          include: { asset: { select: { id: true, assetTag: true, name: true } } },
          orderBy: { assignedAt: "desc" },
        })
      : [],
  ]);

  const categoryOptions: CategoryOption[] = categories.map((c) => ({
    id: c.id,
    name: c.nameTh ?? c.name,
    parentId: c.parentId,
  }));

  const devices = assignments.filter((a) => a.asset !== null);

  return (
    <div className="mx-auto max-w-2xl pb-24 sm:pb-8">
      {/* Header */}
      <div className="mb-5">
        <Link
          href="/support"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับไปที่เคสของฉัน / Back to my cases
        </Link>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <LifeBuoy className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              เปิดเคส IT Support
            </h1>
            <p className="text-sm text-muted-foreground">
              แจ้งปัญหาหรือขอความช่วยเหลือจากทีม IT — ทีมงานจะได้รับแจ้งทันที และคุณติดตามสถานะได้ที่ “เคสของฉัน”
            </p>
          </div>
        </div>
      </div>

      {sp.error === "invalid" && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง / Some fields are missing or invalid.
        </div>
      )}

      {/* Requester summary */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border bg-muted/40 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {initials(user.name)}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-medium">
            <User2 className="h-3.5 w-3.5 text-muted-foreground" />
            {user.name}
          </p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          {employee?.employeeCode && (
            <span className="rounded-full border bg-card px-2.5 py-1 text-muted-foreground">
              รหัส: <span className="font-medium text-foreground">{employee.employeeCode}</span>
            </span>
          )}
          {employee?.department?.name && (
            <span className="rounded-full border bg-card px-2.5 py-1 text-muted-foreground">
              แผนก: <span className="font-medium text-foreground">{employee.department.name}</span>
            </span>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-5 sm:p-6">
          <form action={createCaseAction} className="space-y-7">
            {/* Section 1 — the problem */}
            <section>
              <SectionTitle step={1}>เรื่องที่ต้องการแจ้ง / What’s the problem</SectionTitle>
              <div className="space-y-4">
                <ReporterFields
                  defaultName={user.name}
                  defaultCode={employee?.employeeCode ?? ""}
                />
                <div>
                  <Label htmlFor="subject">
                    เรื่อง / Subject <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="subject"
                    name="subject"
                    required
                    minLength={3}
                    maxLength={300}
                    className="mt-1"
                    placeholder="สรุปปัญหาสั้น ๆ เช่น “เปิดอีเมลไม่ได้”"
                    defaultValue={sp.subject ?? ""}
                  />
                </div>
                <div>
                  <Label htmlFor="typeId">
                    ประเภทความช่วยเหลือ / Type <span className="text-destructive">*</span>
                  </Label>
                  <Select id="typeId" name="typeId" required className="mt-1" defaultValue="">
                    <option value="" disabled>
                      — เลือกประเภท / Select type —
                    </option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nameTh ?? t.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <CategoryPicker categories={categoryOptions} />
                </div>
              </div>
            </section>

            <hr className="border-border" />

            {/* Section 2 — details */}
            <section>
              <SectionTitle step={2}>รายละเอียด / Details</SectionTitle>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="description">
                    อธิบายปัญหา / Description <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="description"
                    name="description"
                    required
                    rows={5}
                    maxLength={5000}
                    className="mt-1"
                    placeholder="อธิบายสิ่งที่เกิดขึ้น ขั้นตอนที่ทำ และสิ่งที่คาดหวัง ยิ่งละเอียดยิ่งช่วยให้แก้ได้เร็ว"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="locationId">สถานที่ / Location</Label>
                    <Select id="locationId" name="locationId" className="mt-1" defaultValue="">
                      <option value="">— ไม่ระบุ / None —</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <DevicePicker
                    initialDevices={devices.map((a) => ({
                      id: a.asset.id,
                      assetTag: a.asset.assetTag,
                      name: a.asset.name,
                    }))}
                  />
                </div>
              </div>
            </section>

            <hr className="border-border" />

            {/* Section 3 — impact + attachment */}
            <section>
              <SectionTitle step={3}>ความเร่งด่วน & ไฟล์แนบ / Impact & attachment</SectionTitle>

              <div className="mb-1 flex items-center gap-1.5">
                <Label>ปัญหานี้กระทบงานของคุณแค่ไหน?</Label>
                <CircleHelp className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                เลือกระดับผลกระทบ — ระบบจะกำหนดความเร่งด่วน (Priority) ให้อัตโนมัติ
              </p>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {IMPACT_ORDER.map((k) => {
                  const m = IMPACT_META[k];
                  return (
                    <label key={k} className="cursor-pointer">
                      <input
                        type="radio"
                        name="impact"
                        value={k}
                        defaultChecked={k === "GENERAL"}
                        className="peer sr-only"
                      />
                      <div className="flex h-full items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/50 peer-checked:border-primary peer-checked:bg-primary/5 peer-checked:ring-2 peer-checked:ring-primary/30 peer-focus-visible:ring-2 peer-focus-visible:ring-primary/40">
                        <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${m.dot}`} aria-hidden />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-sm font-medium">
                            {IMPACT_LABEL[k].th}
                            <span className={`text-[10px] font-bold ${m.accent}`}>
                              {m.priority} · {PRIORITY_LABEL[m.priority].th}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">{m.descTh}</p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="mt-4">
                <Label htmlFor="file" className="flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5" />
                  แนบไฟล์ / Attachment
                </Label>
                <Input
                  id="file"
                  name="file"
                  type="file"
                  accept="image/*,application/pdf"
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  แนบภาพหน้าจอหรือ PDF จะช่วยให้ทีมเข้าใจปัญหาได้เร็วขึ้น
                </p>
              </div>
            </section>

            {/* Actions — sticky on mobile */}
            <div className="fixed inset-x-0 bottom-0 z-10 flex gap-2 border-t bg-background/95 p-4 backdrop-blur sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:pt-1">
              <Button type="submit" className="flex-1 sm:flex-none">
                ส่งเคส / Submit Case
              </Button>
              <Button variant="outline" asChild className="flex-1 sm:flex-none">
                <Link href="/support">ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
