"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const SETTING_KEY = "itreport.ingest";
const COOKIE = "itreport_newkey";
const HR_SETTING_KEY = "hr.ingest";
const HR_COOKIE = "hr_newkey";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Generate (or rotate) an org ingest key. Plaintext is shown exactly once. */
async function generateKey(settingKey: string, cookieName: string, okFlag: string) {
  const user = await requirePermission("settings:manage");
  const key = "tck_" + crypto.randomBytes(24).toString("hex");

  await prisma.systemSetting.upsert({
    where: { organizationId_key: { organizationId: user.organizationId, key: settingKey } },
    create: {
      organizationId: user.organizationId,
      key: settingKey,
      value: { keyHash: sha256(key), keyPrefix: key.slice(0, 12), createdAt: new Date().toISOString(), createdBy: user.email },
    },
    update: {
      value: { keyHash: sha256(key), keyPrefix: key.slice(0, 12), createdAt: new Date().toISOString(), createdBy: user.email },
    },
  });

  // Show the plaintext exactly once via a short-lived httpOnly cookie.
  (await cookies()).set(cookieName, key, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 120, path: "/settings/integrations" });

  await auditLog(user, { action: "UPDATE", entityType: "SYSTEM_SETTING", detail: { key: settingKey, rotated: true } });
  revalidatePath("/settings/integrations");
  redirect(`/settings/integrations?ok=${okFlag}`);
}

async function revokeKey(settingKey: string, cookieName: string, okFlag: string) {
  const user = await requirePermission("settings:manage");
  await prisma.systemSetting.deleteMany({ where: { organizationId: user.organizationId, key: settingKey } });
  (await cookies()).delete(cookieName);
  await auditLog(user, { action: "DELETE", entityType: "SYSTEM_SETTING", detail: { key: settingKey } });
  revalidatePath("/settings/integrations");
  redirect(`/settings/integrations?ok=${okFlag}`);
}

/** Generate (or rotate) the shared collector ingest key. Plaintext shown once. */
export async function generateIngestKeyAction() {
  await generateKey(SETTING_KEY, COOKIE, "generated");
}

export async function revokeIngestKeyAction() {
  await revokeKey(SETTING_KEY, COOKIE, "revoked");
}

/** Generate (or rotate) the dedicated HR sync key. Plaintext shown once. */
export async function generateHrKeyAction() {
  await generateKey(HR_SETTING_KEY, HR_COOKIE, "hr_generated");
}

export async function revokeHrKeyAction() {
  await revokeKey(HR_SETTING_KEY, HR_COOKIE, "hr_revoked");
}
