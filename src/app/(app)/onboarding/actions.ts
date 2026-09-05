"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { createVaultItem } from "@/lib/services/vault";

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

/**
 * Full onboarding detail: account name, work email (password stored in the
 * Vault — never as plaintext here), device assignments (unlimited), the list
 * of software installed, induction, and the Access step (next phase).
 */
export async function saveOnboardingDetail(id: string, formData: FormData) {
  const user = await requirePermission("onboarding:manage");
  const o = await prisma.onboarding.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, status: true } } },
  });
  if (!o) redirect("/employees?tab=onboarding");
  const orgId = user.organizationId;

  const str = (k: string) => {
    const v = formData.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  const accountUsername = str("accountUsername");
  const emailAddress = str("emailAddress");
  const emailPassword = str("emailPassword");
  const note = str("note");
  const accessGranted = formData.get("accessGranted") === "on";
  const inductionDone = formData.get("inductionDone") === "on";

  // Device rows: any number of assetId values under the "deviceAssetId" key.
  const deviceIds = Array.from(new Set(
    formData.getAll("deviceAssetId").filter((v): v is string => typeof v === "string" && v.trim() !== "")
  ));
  // Software: any number of "software" values (names).
  const software = Array.from(new Set(
    formData.getAll("software").filter((v): v is string => typeof v === "string" && v.trim() !== "").map((s) => s.trim())
  ));

  // 1) Email password -> Vault (encrypted). Only when a password was entered
  //    and the actor may create secrets; otherwise keep the previous reference.
  let emailPasswordVaultItemId = o.emailPasswordVaultItemId;
  if (emailPassword && user.permissions.has("vault:create")) {
    const item = await createVaultItem(user, {
      name: `อีเมลพนักงาน / Email — ${o.employee.firstName} ${o.employee.lastName}${emailAddress ? ` (${emailAddress})` : ""}`,
      type: "PASSWORD",
      classification: "HIGH",
      username: emailAddress,
      notes: `สร้างตอน Onboarding / Created during onboarding of ${o.employee.employeeCode}`,
      tags: ["onboarding", "email"],
      secret: { password: emailPassword },
    });
    emailPasswordVaultItemId = item.id;
  }

  // 2) Assign selected devices to the joiner (skip ones already held / not available).
  let assignedCount = 0;
  for (const assetId of deviceIds) {
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM assets WHERE id = ${assetId}::uuid FOR UPDATE`;
        const a = await tx.asset.findFirst({
          where: { id: assetId, organizationId: orgId, deletedAt: null },
          select: { id: true, assetTag: true, name: true, status: true, assignedToId: true },
        });
        if (!a) return;
        if (a.assignedToId === o.employee.id) return; // already held by this employee
        if (a.status !== "AVAILABLE") return; // don't clobber another holder
        await tx.assetAssignment.create({
          data: {
            organizationId: orgId,
            assetId: a.id,
            employeeId: o.employee.id,
            status: "CHECKED_OUT",
            assignedById: user.id,
            purpose: "Onboarding",
          },
        });
        await tx.asset.update({ where: { id: a.id }, data: { status: "ASSIGNED", assignedToId: o.employee.id } });
        await tx.assetHistory.create({
          data: {
            organizationId: orgId,
            assetId: a.id,
            action: "ASSIGN",
            detail: `มอบอุปกรณ์ตอน Onboarding / Assigned during onboarding to ${o.employee.firstName} ${o.employee.lastName}`,
            actorId: user.id,
          },
        });
        assignedCount++;
      });
    } catch {
      // ignore a single bad row; keep processing the rest
    }
  }

  // 3) Derive checklist state from the data captured.
  const heldCount = await prisma.assetAssignment.count({
    where: { organizationId: orgId, employeeId: o.employee.id, status: "CHECKED_OUT" },
  });
  const flags = {
    accountCreated: !!accountUsername,
    emailCreated: !!emailAddress,
    assetAssigned: heldCount > 0,
    softwareAssigned: software.length > 0,
    accessGranted,
    inductionDone,
  };
  const allDone = Object.values(flags).every(Boolean);

  await prisma.onboarding.update({
    where: { id },
    data: {
      accountUsername,
      emailAddress,
      emailPasswordVaultItemId,
      softwareInstalled: software,
      note,
      ...flags,
      status: allDone ? "COMPLETED" : "IN_PROGRESS",
      completedAt: allDone ? new Date() : null,
    },
  });

  await auditLog(user, {
    action: "UPDATE",
    entityType: "ONBOARDING",
    entityId: id,
    detail: { ...flags, assignedNow: assignedCount, software: software.length, completed: allDone },
  });
  revalidatePath(`/onboarding/${id}`);
  revalidatePath("/employees");
  redirect(`/onboarding/${id}?ok=saved`);
}
