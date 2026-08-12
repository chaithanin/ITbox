import { describe, it, expect } from "vitest";
import { sanitizeDetail } from "@/lib/audit";

describe("audit detail sanitizer — no secret leakage into audit logs", () => {
  it("strips password/secret/token/key fields at any depth", () => {
    const out = sanitizeDetail({
      name: "Production Server",
      password: "should-be-removed",
      apiKey: "should-be-removed",
      api_key: "should-be-removed",
      privateKey: "should-be-removed",
      access_token: "should-be-removed",
      dekEnc: "should-be-removed",
      nested: { secretValue: "x", ok: 1, credentials: "y" },
      list: [{ password: "x", keep: true }],
    }) as Record<string, unknown>;

    const json = JSON.stringify(out);
    expect(json).not.toContain("should-be-removed");
    expect(json).not.toContain('"x"');
    expect(out.name).toBe("Production Server");
    expect((out.nested as Record<string, unknown>).ok).toBe(1);
    expect((out.list as Array<Record<string, unknown>>)[0].keep).toBe(true);
  });
});
