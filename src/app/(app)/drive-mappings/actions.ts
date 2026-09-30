"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { createVaultItem, updateVaultItem } from "@/lib/services/vault";

function optStr(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
function parseDrives(v: FormDataEntryValue | null): string[] {
  if (typeof v !== "string") return [];
  return Array.from(new Set(
    v.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0)
  ));
}
const STATUS = ["DRAFT", "ACTIVE", "DONE"] as const;

/** Create a new drive/user setup sheet for a (new) employee. */
export async function createDriveMapping(formData: FormData) {
  const user = await requirePermission("support:work");

  const parsedId = z.string().uuid().safeParse(formData.get("employeeId"));
  const employeeId = parsedId.success ? parsedId.data : null;
  let snap: { employeeCode: string | null; employeeName: string | null; nickname: string | null; position: string | null } = {
    employeeCode: null, employeeName: null, nickname: null, position: null,
  };
  if (employeeId) {
    const emp = await prisma.employee.findFirst({
      where: { id: employeeId, organizationId: user.organizationId, deletedAt: null },
      select: { firstName: true, lastName: true, nickname: true, employeeCode: true, position: true },
    });
    if (emp) snap = {
      employeeCode: emp.employeeCode,
      employeeName: `${emp.firstName} ${emp.lastName}`.trim(),
      nickname: emp.nickname,
      position: emp.position,
    };
  }
  // Manual overrides (used when no employee record is linked)
  snap.employeeName = optStr(formData.get("employeeName")) ?? snap.employeeName;
  snap.employeeCode = optStr(formData.get("employeeCode")) ?? snap.employeeCode;
  snap.nickname = optStr(formData.get("nickname")) ?? snap.nickname;
  snap.position = optStr(formData.get("position")) ?? snap.position;

  const computerName = optStr(formData.get("computerName"));
  const userShare = optStr(formData.get("userShare"));
  const loginUsername = optStr(formData.get("loginUsername")) ?? computerName;
  const drives = parseDrives(formData.get("drives"));
  const notes = optStr(formData.get("notes"));
  const password = optStr(formData.get("password"));

  // Credential → Vault only (never plaintext on the record).
  let credentialVaultItemId: string | null = null;
  if (password && user.permissions.has("vault:create")) {
    const item = await createVaultItem(user, {
      name: `บัญชีผู้ใช้ / User account — ${snap.employeeName || computerName || "user"}`,
      type: "PASSWORD",
      classification: "HIGH",
      username: loginUsername,
      notes: `Drive & user setup${snap.employeeCode ? ` · ${snap.employeeCode}` : ""}`,
      tags: ["drive-mapping", "user-account"],
      secret: { password },
    });
    credentialVaultItemId = item.id;
  }

  const rec = await prisma.driveMapping.create({
    data: {
      organizationId: user.organizationId,
      employeeId,
      ...snap,
      computerName, userShare, loginUsername, drives, notes,
      credentialVaultItemId,
      status: "ACTIVE",
      createdById: user.id,
    },
    select: { id: true },
  });
  await auditLog(user, {
    action: "CREATE", entityType: "DRIVE_MAPPING", entityId: rec.id,
    detail: { employee: snap.employeeName, computerName, drives: drives.length, credential: !!credentialVaultItemId },
  });
  revalidatePath("/drive-mappings");
  redirect(`/drive-mappings/${rec.id}?ok=created`);
}

/** Update the sheet fields (not the credential). */
export async function updateDriveMapping(id: string, formData: FormData) {
  const user = await requirePermission("support:work");
  const rec = await prisma.driveMapping.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true },
  });
  if (!rec) redirect("/drive-mappings");
  const status = z.enum(STATUS).catch("ACTIVE").parse(formData.get("status"));
  await prisma.driveMapping.update({
    where: { id },
    data: {
      employeeName: optStr(formData.get("employeeName")),
      employeeCode: optStr(formData.get("employeeCode")),
      nickname: optStr(formData.get("nickname")),
      position: optStr(formData.get("position")),
      computerName: optStr(formData.get("computerName")),
      userShare: optStr(formData.get("userShare")),
      loginUsername: optStr(formData.get("loginUsername")),
      drives: parseDrives(formData.get("drives")),
      notes: optStr(formData.get("notes")),
      status,
    },
  });
  await auditLog(user, { action: "UPDATE", entityType: "DRIVE_MAPPING", entityId: id, detail: { status } });
  revalidatePath(`/drive-mappings/${id}`);
  revalidatePath("/drive-mappings");
  redirect(`/drive-mappings/${id}?ok=saved`);
}

/** Set or rotate the login password (kept in the Vault). */
export async function setDriveCredential(id: string, formData: FormData) {
  const user = await requirePermission("vault:create");
  const rec = await prisma.driveMapping.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null },
    select: { id: true, credentialVaultItemId: true, employeeName: true, computerName: true, employeeCode: true },
  });
  if (!rec) redirect("/drive-mappings");
  const password = optStr(formData.get("password"));
  const loginUsername = optStr(formData.get("loginUsername")) ?? rec.computerName;
  if (!password) redirect(`/drive-mappings/${id}?error=nopass`);

  let credentialVaultItemId = rec.credentialVaultItemId;
  if (credentialVaultItemId) {
    await updateVaultItem(user, credentialVaultItemId, { username: loginUsername, secret: { password } });
  } else {
    const item = await createVaultItem(user, {
      name: `บัญชีผู้ใช้ / User account — ${rec.employeeName || rec.computerName || "user"}`,
      type: "PASSWORD",
      classification: "HIGH",
      username: loginUsername,
      notes: `Drive & user setup${rec.employeeCode ? ` · ${rec.employeeCode}` : ""}`,
      tags: ["drive-mapping", "user-account"],
      secret: { password },
    });
    credentialVaultItemId = item.id;
  }
  await prisma.driveMapping.update({ where: { id }, data: { credentialVaultItemId, loginUsername } });
  await auditLog(user, { action: "UPDATE", entityType: "DRIVE_MAPPING", entityId: id, detail: { credential: "rotated" } });
  revalidatePath(`/drive-mappings/${id}`);
  redirect(`/drive-mappings/${id}?ok=cred`);
}

/** Soft-delete the sheet. */
export async function deleteDriveMapping(id: string) {
  const user = await requirePermission("support:work");
  const rec = await prisma.driveMapping.findFirst({
    where: { id, organizationId: user.organizationId, deletedAt: null }, select: { id: true },
  });
  if (!rec) redirect("/drive-mappings");
  await prisma.driveMapping.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditLog(user, { action: "DELETE", entityType: "DRIVE_MAPPING", entityId: id });
  revalidatePath("/drive-mappings");
  redirect("/drive-mappings?ok=deleted");
}
