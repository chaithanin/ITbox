import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { DEFAULT_TEMPLATE, DEFAULT_COMPANY_LINKS, type CompanyLink, type TemplateConfig, type SignatureData } from "@/lib/signature";
import { SignatureEditor, type TemplateOption } from "./editor";

export const dynamic = "force-dynamic";

function toConfig(t: {
  companyName: string | null; logoUrl: string | null; primaryColor: string;
  secondaryColor: string; fontFamily: string; fontSize: number; dividerStyle: string;
} | null, orgName: string, orgLogo: string | null): TemplateConfig {
  if (!t) return { ...DEFAULT_TEMPLATE, companyName: orgName, logoUrl: orgLogo ?? "" };
  return {
    companyName: t.companyName || orgName,
    logoUrl: t.logoUrl || orgLogo || "",
    primaryColor: t.primaryColor,
    secondaryColor: t.secondaryColor,
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    dividerStyle: t.dividerStyle,
  };
}

export default async function SignaturePage() {
  const user = await requireUser();

  const [org, employee, profile, templates] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true, logoUrl: true },
    }),
    user.employeeId
      ? prisma.employee.findFirst({
          where: { id: user.employeeId, organizationId: user.organizationId },
          include: { department: { select: { name: true } } },
        })
      : null,
    prisma.signatureProfile.findUnique({ where: { userId: user.id } }),
    prisma.signatureTemplate.findMany({
      where: { organizationId: user.organizationId, active: true, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }],
    }),
  ]);

  const orgName = org?.name ?? "";
  const defaultTemplate = templates.find((t) => t.isDefault) ?? templates[0] ?? null;
  const activeTemplate = profile?.templateId
    ? templates.find((t) => t.id === profile.templateId) ?? defaultTemplate
    : defaultTemplate;

  const config = toConfig(activeTemplate, orgName, org?.logoUrl ?? null);

  // Auto-populate initial data from the user's real profile/employee/org.
  const initial: SignatureData & { templateId: string | null } = profile
    ? {
        templateId: profile.templateId,
        fullName: profile.fullName,
        position: profile.position ?? "",
        department: profile.department ?? "",
        mobilePhone: profile.mobilePhone ?? "",
        officePhone: profile.officePhone ?? "",
        extension: profile.extension ?? "",
        email: profile.email ?? "",
        website: profile.website ?? "",
        address: profile.address ?? "",
        logoUrl: profile.logoUrl ?? "",
        companyLinks:
          Array.isArray(profile.companyLinks) && profile.companyLinks.length > 0
            ? (profile.companyLinks as unknown as CompanyLink[])
            : DEFAULT_COMPANY_LINKS,
      }
    : {
        templateId: defaultTemplate?.id ?? null,
        fullName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : user.name,
        position: employee?.position ?? "",
        department: employee?.department?.name ?? "",
        mobilePhone: employee?.phone ?? "",
        officePhone: "",
        extension: "",
        email: employee?.email ?? user.email,
        website: activeTemplate?.companyName ? "" : "",
        address: "",
        logoUrl: "",
        companyLinks:
          Array.isArray(activeTemplate?.defaultLinks) && activeTemplate!.defaultLinks.length > 0
            ? (activeTemplate!.defaultLinks as unknown as CompanyLink[])
            : DEFAULT_COMPANY_LINKS,
      };

  const templateOptions: TemplateOption[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    config: toConfig(t, orgName, org?.logoUrl ?? null),
  }));

  return (
    <div>
      <PageHeader
        title="Email Signature / ลายเซ็นอีเมล"
        description="สร้างลายเซ็นอีเมลสำหรับ Outlook — ข้อมูลดึงจากโปรไฟล์ของคุณอัตโนมัติ แก้ไขแล้วดูตัวอย่างสด ก่อนคัดลอกไปวาง"
      />
      <SignatureEditor
        initial={initial}
        config={config}
        templates={templateOptions}
      />
    </div>
  );
}
