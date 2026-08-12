/**
 * Integration tests against a real PostgreSQL database (DATABASE_URL).
 * Verifies the vault access chain: RBAC, per-item access, MFA policy,
 * cross-tenant isolation, share expiry. Skipped when no database is available.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { CurrentUser } from "@/lib/session";

const hasDb = !!process.env.DATABASE_URL;
process.env.KMS_PROVIDER = "local";
process.env.LOCAL_KMS_MASTER_KEY ??= "aW50ZWdyYXRpb24tdGVzdC1tYXN0ZXIta2V5";

const prisma = new PrismaClient();
const run = hasDb ? describe : describe.skip;

const ids: Record<string, string> = {};

function fakeUser(over: Partial<CurrentUser>): CurrentUser {
  return {
    id: over.id!,
    organizationId: over.organizationId!,
    email: "t@example.com",
    name: "Test",
    locale: "th",
    mfaEnabled: false,
    roles: over.roles ?? [],
    permissions: over.permissions ?? new Set(),
    employeeId: null,
    ip: "127.0.0.1",
    userAgent: "vitest",
    ...over,
  };
}

run("vault access control (integration)", () => {
  beforeAll(async () => {
    const orgA = await prisma.organization.create({
      data: { name: "Test Org A", slug: `test-a-${Date.now()}` },
    });
    const orgB = await prisma.organization.create({
      data: { name: "Test Org B", slug: `test-b-${Date.now()}` },
    });
    const owner = await prisma.user.create({
      data: { organizationId: orgA.id, email: `owner-${Date.now()}@t.local`, name: "Owner" },
    });
    const colleague = await prisma.user.create({
      data: { organizationId: orgA.id, email: `col-${Date.now()}@t.local`, name: "Colleague" },
    });
    const outsider = await prisma.user.create({
      data: { organizationId: orgB.id, email: `out-${Date.now()}@t.local`, name: "Outsider" },
    });
    ids.orgA = orgA.id;
    ids.orgB = orgB.id;
    ids.owner = owner.id;
    ids.colleague = colleague.id;
    ids.outsider = outsider.id;
  });

  afterAll(async () => {
    await prisma.vaultAccessLog.deleteMany({ where: { organizationId: { in: [ids.orgA, ids.orgB] } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: { in: [ids.orgA, ids.orgB] } } });
    await prisma.vaultShare.deleteMany({ where: { vaultItem: { organizationId: { in: [ids.orgA, ids.orgB] } } } });
    await prisma.vaultItem.deleteMany({ where: { organizationId: { in: [ids.orgA, ids.orgB] } } });
    await prisma.user.deleteMany({ where: { organizationId: { in: [ids.orgA, ids.orgB] } } });
    await prisma.organization.deleteMany({ where: { id: { in: [ids.orgA, ids.orgB] } } });
    await prisma.$disconnect();
  });

  it("encrypts on create — no plaintext in the database row", async () => {
    const { createVaultItem } = await import("@/lib/services/vault");
    const owner = fakeUser({
      id: ids.owner,
      organizationId: ids.orgA,
      permissions: new Set(["vault:create", "vault:read", "vault:reveal", "vault:copy"]),
    });
    const item = await createVaultItem(owner, {
      name: "Integration Server",
      type: "SERVER",
      classification: "MEDIUM",
      secret: { password: "PLAINTEXT-MARKER-12345" },
    });
    ids.item = item.id;
    const row = await prisma.vaultItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(JSON.stringify(row)).not.toContain("PLAINTEXT-MARKER-12345");
    expect(row.ciphertext.length).toBeGreaterThan(10);
  });

  it("owner can reveal; access is audit-logged", async () => {
    const { revealVaultItem } = await import("@/lib/services/vault");
    const owner = fakeUser({
      id: ids.owner,
      organizationId: ids.orgA,
      permissions: new Set(["vault:read", "vault:reveal"]),
    });
    const secret = await revealVaultItem(owner, ids.item, {});
    expect(secret.password).toBe("PLAINTEXT-MARKER-12345");
    const log = await prisma.vaultAccessLog.findFirst({
      where: { vaultItemId: ids.item, action: "REVEAL_SECRET", result: "SUCCESS" },
    });
    expect(log).toBeTruthy();
    // the log itself must not contain the secret
    expect(JSON.stringify(log)).not.toContain("PLAINTEXT-MARKER");
  });

  it("denies reveal without RBAC permission", async () => {
    const { revealVaultItem } = await import("@/lib/services/vault");
    const owner = fakeUser({
      id: ids.owner,
      organizationId: ids.orgA,
      permissions: new Set(["vault:read"]), // no vault:reveal
    });
    await expect(revealVaultItem(owner, ids.item, {})).rejects.toThrow();
  });

  it("denies unshared colleague; allows after share; blocks expired share", async () => {
    const { revealVaultItem, shareVaultItem } = await import("@/lib/services/vault");
    const colleague = fakeUser({
      id: ids.colleague,
      organizationId: ids.orgA,
      permissions: new Set(["vault:read", "vault:reveal"]),
    });
    await expect(revealVaultItem(colleague, ids.item, {})).rejects.toThrow();

    const owner = fakeUser({
      id: ids.owner,
      organizationId: ids.orgA,
      permissions: new Set(["vault:read", "vault:share"]),
    });
    const share = await shareVaultItem(owner, ids.item, {
      userId: ids.colleague,
      permission: "REVEAL",
      expiresAt: new Date(Date.now() + 60_000),
    });
    const secret = await revealVaultItem(colleague, ids.item, {});
    expect(secret.password).toBe("PLAINTEXT-MARKER-12345");

    await prisma.vaultShare.update({
      where: { id: share.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(revealVaultItem(colleague, ids.item, {})).rejects.toThrow();
  });

  it("cross-tenant: outsider cannot see or reveal another org's secret", async () => {
    const { revealVaultItem, vaultVisibilityWhere } = await import("@/lib/services/vault");
    const outsider = fakeUser({
      id: ids.outsider,
      organizationId: ids.orgB,
      permissions: new Set(["vault:read", "vault:reveal", "vault:manage"]),
    });
    await expect(revealVaultItem(outsider, ids.item, {})).rejects.toThrow();
    const where = await vaultVisibilityWhere(outsider);
    const visible = await prisma.vaultItem.findMany({ where });
    expect(visible.find((v) => v.id === ids.item)).toBeUndefined();
  });

  it("MFA policy: HIGH/CRITICAL requires MFA enrollment", async () => {
    const { createVaultItem, revealVaultItem } = await import("@/lib/services/vault");
    const owner = fakeUser({
      id: ids.owner,
      organizationId: ids.orgA,
      permissions: new Set(["vault:create", "vault:read", "vault:reveal"]),
    });
    const item = await createVaultItem(owner, {
      name: "Critical Item",
      type: "PASSWORD",
      classification: "CRITICAL",
      secret: { password: "CRITICAL-VALUE" },
    });
    // Owner has no MFA enrolled → reveal must be refused by policy
    await expect(revealVaultItem(owner, item.id, {})).rejects.toThrow(/MFA/);
  });
});
