"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { safeUrl } from "@/lib/signature";

const orgSchema = z.object({
  name: z.string().trim().min(1).max(200),
  taxId: z.string().trim().max(50).optional().default(""),
  address: z.string().trim().max(500).optional().default(""),
  logoUrl: z.string().trim().max(1000).optional().default(""),
});

export async function updateOrganizationAction(formData: FormData) {
  const user = await requirePermission("settings:manage");
  const p = orgSchema.safeParse(Object.fromEntries(formData));
  if (!p.success) redirect("/settings/organization?error=invalid");
  const d = p.data;
  if (d.logoUrl && !safeUrl(d.logoUrl)) redirect("/settings/organization?error=logo");

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: {
      name: d.name,
      taxId: d.taxId || null,
      address: d.address || null,
      logoUrl: d.logoUrl || null,
    },
  });
  await auditLog(user, {
    action: "UPDATE",
    entityType: "ORGANIZATION",
    entityId: user.organizationId,
    detail: { name: d.name },
  });
  revalidatePath("/settings/organization");
  revalidatePath("/settings");
  redirect("/settings/organization?ok=saved");
}
