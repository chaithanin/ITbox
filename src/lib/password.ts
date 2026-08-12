/**
 * User login password hashing (Argon2id) + password generator/strength.
 *
 * IMPORTANT distinction (by design):
 *  - User LOGIN passwords → Argon2id HASH (one-way, never recoverable).
 *  - Vault SECRETS → AES-256-GCM + KMS envelope ENCRYPTION (recoverable),
 *    see src/lib/crypto/envelope.ts. Never hash vault secrets.
 */
import { hash, verify } from "@node-rs/argon2";
import crypto from "node:crypto";

const ARGON2_OPTS = {
  memoryCost: 19456, // 19 MiB (OWASP recommended baseline)
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTS);
}

export async function verifyPassword(
  hashed: string,
  password: string
): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

// ---------- Password generator ----------

export interface GeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  excludeSimilar: boolean;
}

export const GENERATOR_PRESETS: Record<string, GeneratorOptions> = {
  weak: { length: 8, uppercase: true, lowercase: true, numbers: true, symbols: false, excludeSimilar: false },
  normal: { length: 12, uppercase: true, lowercase: true, numbers: true, symbols: false, excludeSimilar: false },
  strong: { length: 16, uppercase: true, lowercase: true, numbers: true, symbols: true, excludeSimilar: false },
  veryStrong: { length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true, excludeSimilar: false },
  enterprise: { length: 24, uppercase: true, lowercase: true, numbers: true, symbols: true, excludeSimilar: true },
};

const SIMILAR = new Set("il1Lo0O".split(""));

export function generatePassword(opts: GeneratorOptions): string {
  const sets: string[] = [];
  if (opts.uppercase) sets.push("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  if (opts.lowercase) sets.push("abcdefghijklmnopqrstuvwxyz");
  if (opts.numbers) sets.push("0123456789");
  if (opts.symbols) sets.push("!@#$%^&*()-_=+[]{}<>?");
  if (sets.length === 0) sets.push("abcdefghijklmnopqrstuvwxyz");

  const filter = (s: string) =>
    opts.excludeSimilar ? [...s].filter((c) => !SIMILAR.has(c)).join("") : s;
  const pools = sets.map(filter).filter((s) => s.length > 0);
  const all = pools.join("");
  const length = Math.min(Math.max(opts.length, 4), 128);

  const chars: string[] = [];
  // Guarantee at least one char from each selected pool
  for (const pool of pools) chars.push(pool[crypto.randomInt(pool.length)]);
  while (chars.length < length) chars.push(all[crypto.randomInt(all.length)]);
  // Fisher–Yates shuffle with CSPRNG
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, length).join("");
}

// ---------- Password strength (local analysis only — never sent anywhere) ----------

export type Strength = "WEAK" | "FAIR" | "STRONG" | "VERY_STRONG";

const COMMON_PASSWORDS = new Set([
  "password", "password1", "123456", "12345678", "123456789", "qwerty",
  "abc123", "letmein", "admin", "welcome", "iloveyou", "monkey", "dragon",
  "p@ssw0rd", "passw0rd", "admin123", "root", "toor", "changeme", "secret",
]);

export function passwordStrength(pw: string): { score: number; label: Strength } {
  if (!pw) return { score: 0, label: "WEAK" };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (pw.length >= 12) score += 1;
  if (pw.length >= 16) score += 1;
  if (pw.length >= 20) score += 1;
  if (/[a-z]/.test(pw)) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pw)) score += 1;
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) score = 1;
  if (/^(.)\1+$/.test(pw)) score = 1;

  const label: Strength =
    score <= 3 ? "WEAK" : score <= 5 ? "FAIR" : score <= 7 ? "STRONG" : "VERY_STRONG";
  return { score, label };
}
