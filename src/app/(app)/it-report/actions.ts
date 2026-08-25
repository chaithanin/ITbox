"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const CATEGORIES = ["SERVER", "BACKUP", "STORAGE", "CCTV", "PHONE", "GPS", "LOG", "MANGO_LOGIN", "MANGO_USAGE", "OTHER"] as const;
const STATUSES = ["NORMAL", "WARNING", "CRITICAL", "NOT_CHECKED"] as const;
const MODES = ["AUTO", "CHECK_REQUIRED", "ISSUE"] as const;

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const recordSchema = z.object({
  category: z.enum(CATEGORIES),
  name: z.string().trim().min(1).max(200),
  status: z.enum(STATUSES),
  mode: z.enum(MODES),
  healthPercent: z.preprocess((v) => {
    const s = emptyToNull(v);
    return s == null ? null : Number(s);
  }, z.number().int().min(0).max(100).nullable()),
  note: z.preprocess(emptyToNull, z.string().max(2000).nullable()),
});

/** Start of the current UTC day, used as the report date. */
function today(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function recordCheckAction(formData: FormData) {
  const user = await requirePermission("support:work");
  const p = recordSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) redirect("/it-report?error=invalid");
  const d = p.data;
  const checkDate = today();

  await prisma.itHealthCheck.upsert({
    where: {
      organizationId_checkDate_category_name: {
        organizationId: user.organizationId,
        checkDate,
        category: d.category,
        name: d.name,
      },
    },
    create: {
      organizationId: user.organizationId,
      checkDate,
      category: d.category,
      name: d.name,
      status: d.status,
      mode: d.mode,
      healthPercent: d.healthPercent,
      note: d.note,
      checkedById: user.id,
    },
    update: {
      status: d.status,
      mode: d.mode,
      healthPercent: d.healthPercent,
      note: d.note,
      checkedById: user.id,
    },
  });

  await auditLog(user, { action: "UPDATE", entityType: "IT_HEALTH_CHECK", detail: { category: d.category, name: d.name, status: d.status } });
  revalidatePath("/it-report");
  redirect("/it-report?ok=recorded");
}

export async function verifyCheckAction(id: string) {
  const user = await requirePermission("support:work");
  const check = await prisma.itHealthCheck.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!check) redirect("/it-report?error=notfound");
  await prisma.itHealthCheck.update({
    where: { id },
    data: { verifiedById: user.id, verifiedAt: new Date() },
  });
  await auditLog(user, { action: "UPDATE", entityType: "IT_HEALTH_CHECK", entityId: id, detail: { verified: true } });
  revalidatePath("/it-report");
  redirect("/it-report?ok=verified");
}
