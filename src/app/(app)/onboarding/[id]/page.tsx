import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { saveOnboardingDetail } from "../actions";
import { OnboardingDetailForm } from "../onboarding-detail-form";

const ACCESS_FORM_URL = "/forms/information-system-access-request-form.pdf";

const STEP_KEYS = ["accountCreated", "emailCreated", "assetAssigned", "softwareAssigned", "accessGranted", "inductionDone"] as const;

export default async function OnboardingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.permissions.has("onboarding:read")) {
    return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">ไม่มีสิทธิ์เข้าถึง Onboarding / No access.</div>;
  }
  const canManage = user.permissions.has("onboarding:manage");
  const orgId = user.organizationId;

  const o = await prisma.onboarding.findFirst({
    where: { id, organizationId: orgId },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true, employeeCode: true, position: true, department: { select: { name: true } } },
      },
    },
  });
  if (!o) notFound();

  const [availableAssets, currentDevices, licenses] = await Promise.all([
    prisma.asset.findMany({
      where: { organizationId: orgId, deletedAt: null, status: "AVAILABLE" },
      select: { id: true, assetTag: true, name: true, serialNumber: true },
      orderBy: { assetTag: "asc" },
      take: 500,
    }),
    prisma.assetAssignment.findMany({
      where: { organizationId: orgId, employeeId: o.employee.id, status: "CHECKED_OUT" },
      select: { asset: { select: { assetTag: true, name: true } } },
      orderBy: { assignedAt: "desc" },
    }),
    prisma.license.findMany({
      where: { organizationId: orgId, deletedAt: null },
      select: { softwareName: true, vendor: { select: { name: true } } },
      orderBy: { softwareName: "asc" },
    }),
  ]);

  // Unique software names (licenses can repeat a name across seats/vendors).
  const seen = new Set<string>();
  const softwareOptions = licenses
    .filter((l) => l.softwareName && !seen.has(l.softwareName.toLowerCase()) && seen.add(l.softwareName.toLowerCase()))
    .map((l) => ({ name: l.softwareName, vendor: l.vendor?.name ?? null }));

  const done = STEP_KEYS.filter((k) => o[k]).length;
  const save = saveOnboardingDetail.bind(null, o.id);

  return (
    <div className="max-w-3xl">
      <Button variant="ghost" size="sm" asChild className="mb-2">
        <Link href="/employees?tab=onboarding"><ArrowLeft className="h-4 w-4" /> กลับ / Back</Link>
      </Button>
      <PageHeader
        title={`Onboarding — ${o.employee.firstName} ${o.employee.lastName}`}
        description={`${o.employee.employeeCode}${o.employee.position ? ` · ${o.employee.position}` : ""}${o.employee.department?.name ? ` · ${o.employee.department.name}` : ""}`}
      >
        <Badge variant={done === STEP_KEYS.length ? "success" : "warning"}>{done}/{STEP_KEYS.length} ขั้นตอน</Badge>
      </PageHeader>

      {sp.ok === "saved" && (
        <div className="mb-4 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          บันทึกเรียบร้อย / Saved
        </div>
      )}
      {!canManage && (
        <div className="mb-4 rounded-md border bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
          โหมดดูอย่างเดียว — ต้องมีสิทธิ์ onboarding:manage เพื่อแก้ไข / Read-only.
        </div>
      )}

      <OnboardingDetailForm
        action={save}
        canManage={canManage}
        accessFormUrl={ACCESS_FORM_URL}
        initial={{
          accountUsername: o.accountUsername,
          emailAddress: o.emailAddress,
          emailPasswordSet: !!o.emailPasswordVaultItemId,
          softwareInstalled: o.softwareInstalled,
          accessGranted: o.accessGranted,
          inductionDone: o.inductionDone,
          note: o.note,
        }}
        availableAssets={availableAssets.map((a) => ({
          id: a.id,
          label: `${a.assetTag} — ${a.name}${a.serialNumber ? ` (S/N ${a.serialNumber})` : ""}`,
        }))}
        currentDevices={currentDevices.map((d) => ({ assetTag: d.asset.assetTag, name: d.asset.name }))}
        softwareOptions={softwareOptions}
      />
    </div>
  );
}
