/**
 * WebAuthn ceremony plumbing tests (challenge lifecycle + guard rails).
 * Full authenticator crypto is exercised in the browser; here we verify the
 * server-side state machine against a real database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

const hasDb = !!process.env.DATABASE_URL;
process.env.AUTH_URL ??= "http://localhost:3000";

const prisma = new PrismaClient();
const run = hasDb ? describe : describe.skip;
const ids: Record<string, string> = {};

run("webauthn (integration)", () => {
  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { name: "WA Org", slug: `wa-${Date.now()}` },
    });
    const user = await prisma.user.create({
      data: { organizationId: org.id, email: `wa-${Date.now()}@t.local`, name: "WA" },
    });
    ids.org = org.id;
    ids.user = user.id;
  });

  afterAll(async () => {
    await prisma.webAuthnChallenge.deleteMany({ where: { userId: ids.user } });
    await prisma.webAuthnCredential.deleteMany({ where: { userId: ids.user } });
    await prisma.user.deleteMany({ where: { id: ids.user } });
    await prisma.organization.deleteMany({ where: { id: ids.org } });
    await prisma.$disconnect();
  });

  it("registration options create a pending single-use challenge", async () => {
    const { startPasskeyRegistration } = await import("@/lib/webauthn");
    const options = await startPasskeyRegistration({
      id: ids.user,
      email: "wa@t.local",
      name: "WA",
    });
    expect(options.challenge.length).toBeGreaterThan(16);
    expect(options.rp.id).toBe("localhost");
    const rows = await prisma.webAuthnChallenge.findMany({
      where: { userId: ids.user, type: "REGISTRATION", usedAt: null },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].challenge).toBe(options.challenge);
  });

  it("re-requesting options invalidates the previous challenge", async () => {
    const { startPasskeyRegistration } = await import("@/lib/webauthn");
    const first = await startPasskeyRegistration({ id: ids.user, email: "wa@t.local", name: "WA" });
    const second = await startPasskeyRegistration({ id: ids.user, email: "wa@t.local", name: "WA" });
    expect(second.challenge).not.toBe(first.challenge);
    const pending = await prisma.webAuthnChallenge.findMany({
      where: { userId: ids.user, type: "REGISTRATION", usedAt: null },
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].challenge).toBe(second.challenge);
  });

  it("refuses authentication options when no passkey is enrolled", async () => {
    const { startPasskeyAuthentication } = await import("@/lib/webauthn");
    await expect(startPasskeyAuthentication(ids.user)).rejects.toThrow(/NO_PASSKEYS/);
  });

  it("rejects a forged assertion for an unknown credential", async () => {
    const { verifyPasskeyAuthentication, hasPasskeys } = await import("@/lib/webauthn");
    expect(await hasPasskeys(ids.user)).toBe(false);
    const ok = await verifyPasskeyAuthentication(ids.user, {
      id: "unknown-credential",
      rawId: "unknown-credential",
      type: "public-key",
      clientExtensionResults: {},
      response: {
        authenticatorData: "AA",
        clientDataJSON: "AA",
        signature: "AA",
      },
    } as never);
    expect(ok).toBe(false);
  });
});
