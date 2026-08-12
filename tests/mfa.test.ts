import { describe, it, expect } from "vitest";
import * as OTPAuth from "otpauth";
import { generateTotpSecret, totpUri, verifyTotpCode } from "@/lib/mfa";

describe("TOTP MFA", () => {
  it("verifies a valid current code and rejects garbage", () => {
    const secret = generateTotpSecret();
    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1", digits: 6, period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const code = totp.generate();
    expect(verifyTotpCode(secret, code)).toBe(true);
    expect(verifyTotpCode(secret, "000000")).toBe(false);
  });

  it("builds an otpauth:// enrollment URI", () => {
    const secret = generateTotpSecret();
    const uri = totpUri("user@example.com", secret);
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("ITBox");
  });
});
