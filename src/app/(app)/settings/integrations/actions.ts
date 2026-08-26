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

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Generate (or rotate) the IT-report ingest API key. Plaintext shown once. */
export async function generateIngestKeyAction() {
  const user = await requirePermission("settings:manage");
  const key = "tck_" + crypto.randomBytes(24).toString("hex");

  await prisma.systemSetting.upsert({
    where: { organizationId_key: { organizationId: user.organizationId, key: SETTING_KEY } },
    create: {
      organizationId: user.organizationId,
      key: SETTING_KEY,
      value: { keyHash: sha256(key), keyPrefix: key.slice(0, 12), createdAt: new Date().toISOString(), createdBy: user.email },
    },
    update: {
      value: { keyHash: sha256(key), keyPrefix: key.slice(0, 12), createdAt: new Date().toISOString(), createdBy: user.email },
    },
  });

  // Show the plaintext exactly once via a short-lived httpOnly cookie.
  (await cookies()).set(COOKIE, key, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 120, path: "/settings/integrations" });

  await auditLog(user, { action: "UPDATE", entityType: "SYSTEM_SETTING", detail: { key: SETTING_KEY, rotated: true } });
  revalidatePath("/settings/integrations");
  redirect("/settings/integrations?ok=generated");
}

export async function revokeIngestKeyAction() {
  const user = await requirePermission("settings:manage");
  await prisma.systemSetting.deleteMany({ where: { organizationId: user.organizationId, key: SETTING_KEY } });
  (await cookies()).delete(COOKIE);
  await auditLog(user, { action: "DELETE", entityType: "SYSTEM_SETTING", detail: { key: SETTING_KEY } });
  revalidatePath("/settings/integrations");
  redirect("/settings/integrations?ok=revoked");
}
