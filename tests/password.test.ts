import { describe, it, expect } from "vitest";
import {
  hashPassword, verifyPassword, generatePassword, passwordStrength,
  GENERATOR_PRESETS, validatePasswordPolicy,
} from "@/lib/password";

describe("Argon2id login-password hashing", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-9!");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "Correct-Horse-Battery-9!")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("never stores plaintext in the hash", async () => {
    const hash = await hashPassword("MySecretValue123!");
    expect(hash).not.toContain("MySecretValue123");
  });
});

describe("password generator", () => {
  it("honors length and character classes", () => {
    const pw = generatePassword(GENERATOR_PRESETS.enterprise);
    expect(pw).toHaveLength(24);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[0-9]/);
    expect(pw).toMatch(/[^a-zA-Z0-9]/);
  });

  it("excludes similar characters when requested", () => {
    for (let i = 0; i < 20; i++) {
      const pw = generatePassword(GENERATOR_PRESETS.enterprise);
      expect(pw).not.toMatch(/[il1Lo0O]/);
    }
  });

  it("generates unique values", () => {
    const a = generatePassword(GENERATOR_PRESETS.strong);
    const b = generatePassword(GENERATOR_PRESETS.strong);
    expect(a).not.toBe(b);
  });
});

describe("user login password policy (8–12, upper+lower+digit+special, no space)", () => {
  it("accepts the specified passing examples", () => {
    for (const pw of ["Admin@123", "Test#2026", "Abcd1234!"]) {
      expect(validatePasswordPolicy(pw).ok, pw).toBe(true);
    }
  });
  it("rejects the specified failing examples", () => {
    expect(validatePasswordPolicy("12345678").ok).toBe(false); // no letters/special
    expect(validatePasswordPolicy("abcdefgh").ok).toBe(false); // no upper/digit/special
    expect(validatePasswordPolicy("Abc123").ok).toBe(false);   // too short + no special
    expect(validatePasswordPolicy("Admin@1234567").ok).toBe(false); // too long (>12)
    expect(validatePasswordPolicy("Abcd1234").ok).toBe(false); // no special char
  });
  it("rejects passwords containing spaces", () => {
    const r = validatePasswordPolicy("Abc @1234");
    expect(r.ok).toBe(false);
    expect(r.errors).toContain("space");
  });
  it("reports precise error codes", () => {
    expect(validatePasswordPolicy("abcdefg1!").errors).toContain("upper");
    expect(validatePasswordPolicy("ABCDEFG1!").errors).toContain("lower");
    expect(validatePasswordPolicy("Abcdefg!").errors).toContain("digit");
    expect(validatePasswordPolicy("Abcd1234").errors).toContain("special");
  });
});

describe("password strength", () => {
  it("flags common passwords as weak", () => {
    expect(passwordStrength("password").label).toBe("WEAK");
    expect(passwordStrength("P@ssw0rd").label).toBe("WEAK");
  });
  it("rates long diverse passwords highly", () => {
    expect(passwordStrength("xK9#mQ2$vL5&nR8*wT3!").label).toBe("VERY_STRONG");
  });
});
