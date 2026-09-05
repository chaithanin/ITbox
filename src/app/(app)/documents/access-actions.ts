"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const LEVELS = ["L0", "L1", "L2", "L3", "L4", "L5", "L6", "IT_ADMIN"] as const;
const SOURCES = ["DEFAULT", "ADDITIONAL", "RESTRICTED"] as const;

const itemSchema = z.object({
  system: z.string().min(1).max(100),
  systemLabel: z.string().max(200).optional(),
  resource: z.union([z.string(), z.null()]).optional(),
  permissionLevel: z.string().min(1).max(60),
  source: z.enum(SOURCES),
  justification: z.string().max(2000).optional(),
});

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Persist an access request (in addition to the PDF), then show it. */
export async function submitAccessRequest(formData: FormData) {
  const user = await requireUser();
  const org = user.organizationId;

  let items: z.infer<typeof itemSchema>[] = [];
  const raw = formData.get("itemsJson");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) for (const x of parsed) { const p = itemSchema.safeParse(x); if (p.success) items.push(p.data); }
    } catch { /* ignore */ }
  }

  const lvRaw = str(formData, "jobLevel");
  const jobLevel = lvRaw && (LEVELS as readonly string[]).includes(lvRaw) ? (lvRaw as (typeof LEVELS)[number]) : null;
  const employeeCode = str(formData, "employeeCode");
  const parseDate = (s: string | null) => (s ? new Date(s) : null);

  let employeeId: string | null = null;
  if (employeeCode) {
    const emp = await prisma.employee.findFirst({ where: { organizationId: org, employeeCode: { equals: employeeCode, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
    employeeId = emp?.id ?? null;
  }

  const request = await prisma.accessRequest.create({
    data: {
      organizationId: org,
      refNo: str(formData, "refNo"),
      employeeId, employeeCode,
      nameTh: str(formData, "nameTh"),
      nameEn: str(formData, "nameEn"),
      phone: str(formData, "phone"),
      email: str(formData, "email"),
      company: str(formData, "company"),
      department: str(formData, "department2") || str(formData, "department"),
      position: str(formData, "position"),
      jobLevel,
      effectiveDate: parseDate(str(formData, "effectiveDate")),
      expiryDate: parseDate(str(formData, "expiryDate")),
      businessJustification: str(formData, "businessJustification"),
      approvalChain: (str(formData, "approvalChain") || "").split("|").filter(Boolean).join(" → ") || null,
      status: "SUBMITTED",
      createdById: user.id,
      items: {
        create: items.map((i) => ({
          system: i.systemLabel || i.system,
          resource: i.resource ?? null,
          permissionLevel: i.permissionLevel,
          source: i.source,
          businessJustification: i.justification ?? null,
        })),
      },
    },
    select: { id: true },
  });

  await auditLog(user, { action: "CREATE", entityType: "ACCESS_REQUEST", entityId: request.id, detail: { items: items.length } });
  revalidatePath("/access-requests");
  redirect(`/access-requests/${request.id}?ok=submitted`);
}
