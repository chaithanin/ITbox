/**
 * Envelope encryption for vault secrets.
 *
 *   plaintext secret (JSON)
 *     → AES-256-GCM with a fresh per-record DEK
 *     → DEK wrapped by KMS (Cloud KMS in production)
 *     → store { ciphertext, iv, authTag, dekEnc, kmsKeyVersion }
 *
 * The DEK is generated per encryption, used once, and zeroed after use.
 * Plaintext is never logged or persisted anywhere.
 */
import crypto from "node:crypto";
import { getKmsProvider } from "./kms";

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  dekEnc: string;
  kmsKeyVersion: string;
}

export async function encryptSecret(plaintext: string): Promise<EncryptedPayload> {
  const kms = getKmsProvider();
  const dek = crypto.randomBytes(32);
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
    const ct = Buffer.concat([
      cipher.update(Buffer.from(plaintext, "utf8")),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const { wrapped, keyVersion } = await kms.wrapDek(dek);
    return {
      ciphertext: ct.toString("base64"),
      iv: iv.toString("base64"),
      authTag: tag.toString("base64"),
      dekEnc: wrapped,
      kmsKeyVersion: keyVersion,
    };
  } finally {
    dek.fill(0);
  }
}

export async function decryptSecret(payload: {
  ciphertext: string;
  iv: string;
  authTag: string;
  dekEnc: string;
}): Promise<string> {
  const kms = getKmsProvider();
  const dek = await kms.unwrapDek(payload.dekEnc);
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      dek,
      Buffer.from(payload.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
    const pt = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]);
    return pt.toString("utf8");
  } finally {
    dek.fill(0);
  }
}
