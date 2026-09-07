"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { generateAccessRefNo } from "@/lib/documents/access-ref";

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
      refNo: str(formData, "refNo") || (await generateAccessRefNo(org)),
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

// ===========================================================================
// ERP per-menu access matrix (form 4.A). Decodes the native checkbox names
// into AccessRequestItem rows — no schema change, no secrets involved.
// ===========================================================================
const FLAG_LABEL: Record<string, string> = {
  enabled: "Enabled", notPrintable: "Not Printable", readOnly: "Read Only", notSaveAs: "Not Save As",
  admin: "Admin", editor: "Editor", viewer: "Viewer", createNew: "Create New Account",
};

export async function submitAccessMatrix(formData: FormData) {
  const user = await requireUser();
  const org = user.organizationId;
  const { ERP_MODULES, MARKETING_GROUPS, SALES_ROLES, RENTAL_ROLES } = await import("@/lib/documents/access-catalog");

  type Row = { system: string; resource: string; permissionLevel: string };
  const rows: Row[] = [];
  const on = (k: string) => formData.get(k) === "on";

  for (const m of ERP_MODULES) {
    if (on(`module:${m.code}`)) rows.push({ system: m.code, resource: "เข้าใช้งาน Module นี้ / Module Access", permissionLevel: "Enabled" });
    const items = m.sections.flatMap((s) => s.items);
    items.forEach((label, i) => {
      const flags = ["enabled", "notPrintable", "readOnly", "notSaveAs"].filter((f) => on(`erp:${m.code}:${i}:${f}`));
      if (flags.length) rows.push({ system: m.code, resource: label, permissionLevel: flags.map((f) => FLAG_LABEL[f]).join(", ") });
    });
  }
  MARKETING_GROUPS.forEach((g, gi) => {
    g.rows.forEach((r, ri) => {
      const cols = ["admin", "editor", "viewer", "createNew"].filter((c) => on(`mkt:${gi}:${ri}:${c}`));
      if (cols.length) rows.push({ system: "ONLINE_MARKETING", resource: `${g.title} — ${r.label}`, permissionLevel: cols.map((c) => FLAG_LABEL[c]).join(", ") });
    });
  });
  SALES_ROLES.forEach((role, ri) => {
    const cols = ["admin", "editor", "viewer"].filter((c) => on(`sales:${ri}:${c}`));
    if (cols.length) rows.push({ system: "SALES (Venio CRM)", resource: role, permissionLevel: cols.map((c) => FLAG_LABEL[c]).join(", ") });
  });
  RENTAL_ROLES.forEach((role, ri) => {
    const cols = ["admin", "editor", "viewer"].filter((c) => on(`rental:${ri}:${c}`));
    if (cols.length) rows.push({ system: "RENTAL (Horganice)", resource: role, permissionLevel: cols.map((c) => FLAG_LABEL[c]).join(", ") });
  });

  const employeeCode = str(formData, "employeeCode");
  let employeeId: string | null = null;
  if (employeeCode) {
    const emp = await prisma.employee.findFirst({ where: { organizationId: org, employeeCode: { equals: employeeCode, mode: "insensitive" }, deletedAt: null }, select: { id: true } });
    employeeId = emp?.id ?? null;
  }

  const request = await prisma.accessRequest.create({
    data: {
      organizationId: org,
      refNo: str(formData, "refNo") || (await generateAccessRefNo(org)),
      employeeId, employeeCode,
      nameTh: str(formData, "nameTh"), nameEn: str(formData, "nameEn"),
      phone: str(formData, "phone"), email: str(formData, "email"),
      department: str(formData, "department"), position: str(formData, "position"),
      businessJustification: str(formData, "note"),
      status: "SUBMITTED",
      createdById: user.id,
      items: { create: rows.map((r) => ({ system: r.system, resource: r.resource, permissionLevel: r.permissionLevel, source: "DEFAULT" as const })) },
    },
    select: { id: true },
  });
  await auditLog(user, { action: "CREATE", entityType: "ACCESS_REQUEST", entityId: request.id, detail: { items: rows.length, form: "erp-matrix" } });
  revalidatePath("/access-requests");
  redirect(`/access-requests/${request.id}?ok=submitted`);
}
