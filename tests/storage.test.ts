import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";

const TEST_DIR = path.resolve(".uploads-test");

beforeAll(() => {
  process.env.STORAGE_PROVIDER = "local";
  process.env.LOCAL_STORAGE_DIR = TEST_DIR;
});

afterAll(async () => {
  await fs.rm(TEST_DIR, { recursive: true, force: true });
});

describe("local storage provider", () => {
  it("round-trips a file", async () => {
    const { getStorageProvider } = await import("@/lib/storage");
    const storage = getStorageProvider();
    const data = Buffer.from("hello-itbox-upload");
    await storage.put("org1/assets/a1/test.txt", data, "text/plain");
    const back = await storage.get("org1/assets/a1/test.txt");
    expect(back.toString()).toBe("hello-itbox-upload");
    await storage.delete("org1/assets/a1/test.txt");
    await expect(storage.get("org1/assets/a1/test.txt")).rejects.toThrow();
  });

  it("blocks path traversal outside the storage root", async () => {
    const { getStorageProvider } = await import("@/lib/storage");
    const storage = getStorageProvider();
    await expect(
      storage.put("../outside.txt", Buffer.from("x"), "text/plain")
    ).rejects.toThrow(/Invalid storage path/);
    await expect(storage.get("../../etc/passwd")).rejects.toThrow(/Invalid storage path/);
  });

  it("only allows safe upload content types", async () => {
    const { ALLOWED_UPLOAD_TYPES } = await import("@/lib/storage");
    expect(ALLOWED_UPLOAD_TYPES["application/pdf"]).toBe("pdf");
    expect(ALLOWED_UPLOAD_TYPES["text/html"]).toBeUndefined();
    expect(ALLOWED_UPLOAD_TYPES["application/x-msdownload"]).toBeUndefined();
    expect(ALLOWED_UPLOAD_TYPES["image/svg+xml"]).toBeUndefined(); // SVG = XSS vector
  });
});
