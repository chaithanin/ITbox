/**
 * One-off maintenance: change an admin account's email and/or reset its
 * password. Runs the same way as the seed (node --experimental-strip-types)
 * and lives under prisma/ so it ships inside the Cloud Run image.
 *
 * SECRET-FREE BY DESIGN — never hard-code credentials here; this repo is public.
 * All values come from the environment at run time:
 *
 *   OLD_ADMIN_EMAIL     current email to match   (default: admin@example.com)
 *   NEW_ADMIN_EMAIL     new email to set         (required)
 *   NEW_ADMIN_PASSWORD  new login password       (required; org policy applies)
 *
 * Local:
 *   set -a; . ./.env; set +a
 *   OLD_ADMIN_EMAIL=admin@example.com NEW_ADMIN_EMAIL=you@co.com \
 *   NEW_ADMIN_PASSWORD='••••••••' node --experimental-strip-types prisma/set-admin.ts
 *
 * Idempotent: updates the matched user's email + Argon2id hash, and revokes its
 * active sessions so the new password takes effect everywhere.
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

// Must match src/lib/password.ts (OWASP baseline).
const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

// Mirror the login password policy from src/lib/password.ts:
// 8–12 chars, ≥1 upper, ≥1 lower, ≥1 digit, ≥1 special, no whitespace.
function policyErrors(pw: string): string[] {
  const e: string[] = [];
  if (pw.length < 8) e.push("min-8");
  if (pw.length > 12) e.push("max-12");
  if (!/[A-Z]/.test(pw)) e.push("uppercase");
  if (!/[a-z]/.test(pw)) e.push("lowercase");
  if (!/[0-9]/.test(pw)) e.push("digit");
  if (!/[^A-Za-z0-9\s]/.test(pw)) e.push("special");
  if (/\s/.test(pw)) e.push("no-space");
  return e;
}

async function main() {
  const oldEmail = (process.env.OLD_ADMIN_EMAIL ?? "admin@example.com").trim().toLowerCase();
  const newEmail = process.env.NEW_ADMIN_EMAIL?.trim().toLowerCase();
  const newPassword = process.env.NEW_ADMIN_PASSWORD;

  if (!newEmail || !newPassword) {
    throw new Error("NEW_ADMIN_EMAIL and NEW_ADMIN_PASSWORD are required environment variables.");
  }
  const errs = policyErrors(newPassword);
  if (errs.length) {
    throw new Error(`NEW_ADMIN_PASSWORD does not meet policy: ${errs.join(", ")}`);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: oldEmail } });
    if (!user) throw new Error(`No user found with email "${oldEmail}".`);

    if (newEmail !== oldEmail) {
      const clash = await prisma.user.findUnique({ where: { email: newEmail } });
      if (clash && clash.id !== user.id) {
        throw new Error(`Email "${newEmail}" is already used by another account.`);
      }
    }

    const passwordHash = await hash(newPassword, ARGON2_OPTS);
    await prisma.user.update({
      where: { id: user.id },
      data: { email: newEmail, passwordHash },
    });

    // Force re-login with the new credentials.
    const revoked = await prisma.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    console.log(
      `✅ Admin updated: "${oldEmail}" → "${newEmail}" ` +
        `(password reset, ${newPassword.length} chars; ${revoked.count} session(s) revoked).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
