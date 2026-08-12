import { describe, it, expect } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

describe("rate limiter", () => {
  it("allows up to the limit then blocks", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5, 60_000)).toBe(true);
    }
    expect(checkRateLimit(key, 5, 60_000)).toBe(false);
  });

  it("isolates keys", () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect(checkRateLimit(a, 1, 60_000)).toBe(true);
    expect(checkRateLimit(a, 1, 60_000)).toBe(false);
    expect(checkRateLimit(b, 1, 60_000)).toBe(true);
  });
});
