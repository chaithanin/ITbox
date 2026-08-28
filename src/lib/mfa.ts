/**
 * TOTP MFA. The TOTP secret is stored envelope-encrypted (never plaintext).
 */
import * as OTPAuth from "otpauth";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto/envelope";

const ISSUER = "TECHCORE";

export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function totpUri(email: string, secretB32: string): string {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretB32),
  });
  return totp.toString();
}

/**
 * Validate a code and return the absolute TOTP time-step it matched (for replay
 * protection), or null if invalid. period=30s, ±1 window.
 */
export function verifyTotpCode(secretB32: string, code: string): number | null {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretB32),
  });
  const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
  if (delta === null) return null;
  return Math.floor(Date.now() / 1000 / 30) + delta;
}

/** Persist an (encrypted) TOTP secret for a user. */
export async function storeTotpSecret(userId: string, secretB32: string) {
  const enc = await encryptSecret(secretB32);
  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecretEnc: JSON.stringify({
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        authTag: enc.authTag,
      }),
      totpSecretDekEnc: enc.dekEnc,
    },
  });
}

/**
 * Verify a TOTP code for a user whose secret is stored encrypted, with replay
 * protection: a time-step is accepted at most once (records the last-used step
 * and rejects any code from that step or earlier).
 */
export async function verifyTotp(
  user: Pick<User, "id" | "totpSecretEnc" | "totpSecretDekEnc" | "totpLastStep">,
  code: string
): Promise<boolean> {
  if (!user.totpSecretEnc || !user.totpSecretDekEnc) return false;
  try {
    const parsed = JSON.parse(user.totpSecretEnc) as {
      ciphertext: string;
      iv: string;
      authTag: string;
    };
    const secret = await decryptSecret({ ...parsed, dekEnc: user.totpSecretDekEnc });
    const step = verifyTotpCode(secret, code);
    if (step === null) return false;
    // Reject replay of an already-used (or older) code.
    if (user.totpLastStep != null && BigInt(step) <= user.totpLastStep) return false;
    await prisma.user.update({ where: { id: user.id }, data: { totpLastStep: BigInt(step) } });
    return true;
  } catch {
    return false;
  }
}
