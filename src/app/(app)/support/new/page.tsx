import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { IMPACT_LABEL } from "@/lib/services/support";
import type { CaseImpact } from "@prisma/client";
import { createCaseAction } from "../actions";
import { CategoryPicker, type CategoryOption } from "./category-picker";

const IMPACT_ORDER: CaseImpact[] = ["UNUSABLE", "MAJOR", "PARTIAL", "GENERAL"];

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
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="เปิดเคส IT Support / New Case"
        description="แจ้งปัญหาหรือขอความช่วยเหลือจากทีม IT / Report a problem or request IT help"
      >
        <Button variant="outline" asChild>
          <Link href="/support">ยกเลิก / Cancel</Link>
        </Button>
      </PageHeader>

      {sp.error === "invalid" && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          กรอกข้อมูลไม่ครบหรือไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง / Some fields are missing or invalid.
          Please check and try again.
        </div>
      )}

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>ผู้แจ้ง / Requester</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted-foreground">ชื่อ / Name</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted-foreground">รหัสพนักงาน / Employee code</dt>
              <dd className="font-medium">{employee?.employeeCode ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted-foreground">แผนก / Department</dt>
              <dd className="font-medium">{employee?.department?.name ?? "-"}</dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted-foreground">อีเมล / Email</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <form action={createCaseAction} className="grid gap-4">
            <div>
              <Label htmlFor="subject">เรื่อง / Subject *</Label>
              <Input
                id="subject"
                name="subject"
                required
                minLength={3}
                maxLength={300}
                className="mt-1"
                placeholder="สรุปปัญหาสั้นๆ / Short summary of the problem"
              />
            </div>

            <div>
              <Label htmlFor="typeId">ต้องการความช่วยเหลือเรื่อง / Type *</Label>
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

            <div>
              <Label htmlFor="description">รายละเอียด / Description *</Label>
              <Textarea
                id="description"
                name="description"
                required
                rows={5}
                maxLength={5000}
                className="mt-1"
                placeholder="อธิบายปัญหาที่พบ ขั้นตอนที่ทำ และสิ่งที่คาดหวัง / Describe the issue, what you did, and what you expected"
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
              <div>
                <Label htmlFor="assetId">อุปกรณ์ของฉัน / My Device</Label>
                {devices.length > 0 ? (
                  <Select id="assetId" name="assetId" className="mt-1" defaultValue="">
                    <option value="">— ไม่ระบุ / None —</option>
                    {devices.map((a) => (
                      <option key={a.asset.id} value={a.asset.id}>
                        {a.asset.assetTag} — {a.asset.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    ไม่มีอุปกรณ์ที่ผูกกับคุณ / No devices assigned to you
                  </p>
                )}
              </div>
            </div>

            <div>
              <Label htmlFor="impact">ระดับผลกระทบ / Impact</Label>
              <Select id="impact" name="impact" className="mt-1" defaultValue="GENERAL">
                {IMPACT_ORDER.map((k) => (
                  <option key={k} value={k}>
                    {IMPACT_LABEL[k].icon} {IMPACT_LABEL[k].th} / {IMPACT_LABEL[k].en}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                ระบบจะกำหนดความเร่งด่วน (Priority) ให้อัตโนมัติ / Priority is set automatically
              </p>
            </div>

            <div>
              <Label htmlFor="file">แนบไฟล์ / Attachment</Label>
              <Input
                id="file"
                name="file"
                type="file"
                accept="image/*,application/pdf"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                รูปภาพหรือ PDF / Images or PDF
              </p>
            </div>

            <div className="flex gap-2">
              <Button type="submit">ส่งเคส / Submit Case</Button>
              <Button variant="outline" asChild>
                <Link href="/support">ยกเลิก / Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
