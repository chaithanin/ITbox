"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { KPI_ORDER } from "@/lib/services/kpi";
import type { KpiMetric } from "@prisma/client";

export async function saveKpiConfigAction(formData: FormData) {
  const user = await requirePermission("support:settings");
  const num = z.coerce.number();

  for (const metric of KPI_ORDER) {
    const target = num.safeParse(formData.get(`target_${metric}`));
    const weight = num.safeParse(formData.get(`weight_${metric}`));
    const active = formData.get(`active_${metric}`) === "on";
    if (!target.success || !weight.success) continue;
    await prisma.kpiConfig.upsert({
      where: { organizationId_metric: { organizationId: user.organizationId, metric: metric as KpiMetric } },
      create: {
        organizationId: user.organizationId,
        metric: metric as KpiMetric,
        target: Math.max(0, target.data),
        weight: Math.max(0, Math.min(100, Math.round(weight.data))),
        active,
        sortOrder: KPI_ORDER.indexOf(metric) + 1,
      },
      update: {
        target: Math.max(0, target.data),
        weight: Math.max(0, Math.min(100, Math.round(weight.data))),
        active,
      },
    });
  }
  await auditLog(user, { action: "UPDATE", entityType: "KPI_CONFIG" });
  revalidatePath("/settings/kpi");
  redirect("/settings/kpi?ok=1");
}
