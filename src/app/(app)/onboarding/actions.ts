"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const TASKS = ["accountCreated", "emailCreated", "assetAssigned", "softwareAssigned", "accessGranted", "inductionDone"] as const;

export async function startOnboarding(formData: FormData) {
  const user = await requirePermission("onboarding:manage");
  const employeeId = z.string().uuid().parse(formData.get("employeeId"));
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, organizationId: user.organizationId, deletedAt: null }, select: { id: true, firstName: true, lastName: true } });
  if (!emp) redirect("/onboarding?error=emp");
  const existing = await prisma.onboarding.findFirst({ where: { organizationId: user.organizationId, employeeId, status: { not: "COMPLETED" } }, select: { id: true } });
  if (existing) redirect(`/onboarding?ok=exists`);
  const o = await prisma.onboarding.create({
    data: { organizationId: user.organizationId, employeeId, status: "IN_PROGRESS", startedById: user.id },
    select: { id: true },
  });
  await auditLog(user, { action: "CREATE", entityType: "ONBOARDING", entityId: o.id, detail: { employee: `${emp.firstName} ${emp.lastName}` } });
  revalidatePath("/onboarding");
  redirect("/onboarding?ok=started");
}

export async function saveChecklist(id: string, formData: FormData) {
  const user = await requirePermission("onboarding:manage");
  const o = await prisma.onboarding.findFirst({ where: { id, organizationId: user.organizationId }, select: { id: true } });
  if (!o) redirect("/onboarding");
  const data: Record<string, boolean> = {};
  for (const t of TASKS) data[t] = formData.get(t) === "on";
  const allDone = Object.values(data).every(Boolean);
  await prisma.onboarding.update({
    where: { id },
    data: {
      ...data,
      status: allDone ? "COMPLETED" : "IN_PROGRESS",
      completedAt: allDone ? new Date() : null,
    },
  });
  await auditLog(user, { action: "UPDATE", entityType: "ONBOARDING", entityId: id, detail: { ...data, completed: allDone } });
  revalidatePath("/onboarding");
  redirect(`/onboarding?ok=saved`);
}
