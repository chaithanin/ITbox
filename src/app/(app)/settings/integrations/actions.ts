"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";
import { encryptSecret, decryptSecret } from "@/lib/crypto/envelope";
import { resolveIngestOrg } from "@/lib/ingest-auth";

const TEST_COOKIE = "hr_test_result";

const SETTING_KEY = "itreport.ingest";
const COOKIE = "itreport_newkey";
const HR_SETTING_KEY = "hr.ingest";
const HR_COOKIE = "hr_newkey";

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/**
 * Generate (or rotate) an org ingest key.
 *
 * We keep the SHA-256 hash for constant-time auth verification AND store the
 * plaintext KMS-envelope-encrypted (same mechanism as the Vault) so an admin
 * can reveal it again later without rotating — revealing a rotated key would
 * otherwise force re-configuring the far side. The plaintext is still shown
 * inline once right after generation via the short-lived cookie.
 */
async function generateKey(settingKey: string, cookieName: string, okFlag: string) {
  const user = await requirePermission("settings:manage");
  const key = "tck_" + crypto.randomBytes(24).toString("hex");
  const enc = await encryptSecret(key);

  const value: Prisma.InputJsonObject = {
    keyHash: sha256(key),
    keyPrefix: key.slice(0, 12),
    keyEnc: {
      ciphertext: enc.ciphertext,
      iv: enc.iv,
      authTag: enc.authTag,
      dekEnc: enc.dekEnc,
      kmsKeyVersion: enc.kmsKeyVersion,
    },
    createdAt: new Date().toISOString(),
    createdBy: user.email ?? "",
  };
  await prisma.systemSetting.upsert({
    where: { organizationId_key: { organizationId: user.organizationId, key: settingKey } },
    create: { organizationId: user.organizationId, key: settingKey, value },
    update: { value },
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

/**
 * Reveal the current key again (decrypt the stored ciphertext). Shows the
 * plaintext via the same short-lived one-time card and is audited as a VIEW.
 * Keys created before encrypted-at-rest storage have no ciphertext and cannot
 * be revealed — the caller must rotate to get a fresh, revealable key.
 */
async function revealKey(settingKey: string, cookieName: string, okFlag: string) {
  const user = await requirePermission("settings:manage");
  const s = await prisma.systemSetting.findFirst({
    where: { organizationId: user.organizationId, key: settingKey },
    select: { value: true },
  });
  const v = (s?.value ?? null) as { keyEnc?: { ciphertext: string; iv: string; authTag: string; dekEnc: string } } | null;
  if (!v?.keyEnc) {
    redirect(`/settings/integrations?ok=${okFlag}_none`);
  }
  const plain = await decryptSecret(v.keyEnc);
  (await cookies()).set(cookieName, plain, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 120, path: "/settings/integrations" });
  await auditLog(user, { action: "VIEW", entityType: "SYSTEM_SETTING", detail: { key: settingKey, revealed: true } });
  redirect(`/settings/integrations?ok=${okFlag}`);
}

/** Generate (or rotate) the shared collector ingest key. Plaintext shown once. */
export async function generateIngestKeyAction() {
  await generateKey(SETTING_KEY, COOKIE, "generated");
}

export async function revokeIngestKeyAction() {
  await revokeKey(SETTING_KEY, COOKIE, "revoked");
}

/** Reveal the current collector key again (decrypt + show once). */
export async function revealIngestKeyAction() {
  await revealKey(SETTING_KEY, COOKIE, "revealed");
}

/** Generate (or rotate) the dedicated HR sync key. Plaintext shown once. */
export async function generateHrKeyAction() {
  await generateKey(HR_SETTING_KEY, HR_COOKIE, "hr_generated");
}

export async function revokeHrKeyAction() {
  await revokeKey(HR_SETTING_KEY, HR_COOKIE, "hr_revoked");
}

/** Reveal the current HR sync key again (decrypt + show once). */
export async function revealHrKeyAction() {
  await revealKey(HR_SETTING_KEY, HR_COOKIE, "hr_revealed");
}

/**
 * Self-test the HR sync connection without leaving the server or needing the
 * plaintext key on the client. Decrypts the stored key and runs it through the
 * real ingest auth resolver (the exact code the /api/hr/employees/sync endpoint
 * uses) against a synthetic request — proving the key is configured, decrypts,
 * and authenticates to this org. Purely a read; nothing is written. Result is
 * surfaced via a short-lived cookie the page renders.
 */
export async function testHrConnectionAction() {
  const user = await requirePermission("settings:manage");
  const jar = await cookies();
  const put = (code: string) =>
    jar.set(TEST_COOKIE, code, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60, path: "/settings/integrations" });

  const s = await prisma.systemSetting.findFirst({
    where: { organizationId: user.organizationId, key: HR_SETTING_KEY },
    select: { value: true },
  });
  const v = (s?.value ?? null) as { keyEnc?: { ciphertext: string; iv: string; authTag: string; dekEnc: string } } | null;

  let result: string;
  if (!v) {
    result = "nokey";
  } else if (!v.keyEnc) {
    result = "legacy";
  } else {
    try {
      const key = await decryptSecret(v.keyEnc);
      const req = new Request("https://self.internal/api/hr/employees/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "x-real-ip": "self-test" },
      });
      const auth = await resolveIngestOrg(req, { keys: [HR_SETTING_KEY, SETTING_KEY] });
      result = auth.ok && auth.orgId === user.organizationId ? "ok" : "mismatch";
    } catch {
      result = "error";
    }
  }

  put(result);
  await auditLog(user, { action: "VIEW", entityType: "SYSTEM_SETTING", detail: { key: HR_SETTING_KEY, test: result } });
  redirect("/settings/integrations?ok=hr_tested");
}
