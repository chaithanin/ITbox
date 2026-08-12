import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.KMS_PROVIDER = "local";
  process.env.LOCAL_KMS_MASTER_KEY = "dGVzdC1tYXN0ZXIta2V5LWZvci11bml0LXRlc3Rz";
});

describe("envelope encryption (AES-256-GCM + KMS wrap)", () => {
  it("round-trips a secret", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/envelope");
    const plaintext = JSON.stringify({ password: "S3cure!Demo#Value", apiKey: "k-123" });
    const enc = await encryptSecret(plaintext);
    expect(enc.ciphertext).not.toContain("S3cure");
    expect(enc.dekEnc.length).toBeGreaterThan(40);
    expect(enc.kmsKeyVersion).toBe("local-1");
    const dec = await decryptSecret(enc);
    expect(dec).toBe(plaintext);
  });

  it("produces unique DEK/IV per encryption (same plaintext → different ciphertext)", async () => {
    const { encryptSecret } = await import("@/lib/crypto/envelope");
    const a = await encryptSecret("same-value");
    const b = await encryptSecret("same-value");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    expect(a.dekEnc).not.toBe(b.dekEnc);
  });

  it("rejects tampered ciphertext (GCM auth)", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/envelope");
    const enc = await encryptSecret("integrity-protected");
    const buf = Buffer.from(enc.ciphertext, "base64");
    buf[0] ^= 0xff;
    await expect(
      decryptSecret({ ...enc, ciphertext: buf.toString("base64") })
    ).rejects.toThrow();
  });

  it("rejects a tampered wrapped DEK", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/crypto/envelope");
    const enc = await encryptSecret("dek-protected");
    const buf = Buffer.from(enc.dekEnc, "base64");
    buf[buf.length - 1] ^= 0xff;
    await expect(
      decryptSecret({ ...enc, dekEnc: buf.toString("base64") })
    ).rejects.toThrow();
  });
});
