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

export function verifyTotpCode(secretB32: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretB32),
  });
  return totp.validate({ token: code.replace(/\s/g, ""), window: 1 }) !== null;
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

/** Verify a TOTP code for a user whose secret is stored encrypted. */
export async function verifyTotp(
  user: Pick<User, "totpSecretEnc" | "totpSecretDekEnc">,
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
    return verifyTotpCode(secret, code);
  } catch {
    return false;
  }
}
