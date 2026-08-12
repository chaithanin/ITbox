import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("assets", () => {
  test("create an asset, see detail page with QR, find it via search", async ({ page }) => {
    // Traverses three routes that each pay a first-hit compile on the dev
    // server (/assets/new, /assets/[id], /assets) — allow triple timeout.
    test.slow();
    await login(page, "itmanager@example.com", "SEED_USER_PASSWORD");

    const tag = `E2E-${Date.now()}`;

    await page.goto("/assets/new");
    await page.locator("input[name=assetTag]").fill(tag);
    await page.locator("input[name=name]").fill(`E2E Test Asset ${tag}`);
    await page.getByRole("button", { name: "บันทึก / Save" }).click();

    // Server action redirects to /assets/<id> (must not stay on /assets/new)
    await page.waitForURL(/\/assets\/(?!new$)[^/?#]+$/, { timeout: 30_000 });

    await expect(page.getByText(tag).first()).toBeVisible();
    await expect(page.locator(`img[alt="QR ${tag}"]`)).toBeVisible();

    // "domcontentloaded" — the full "load" event can be slow on the dev server
    // (QR images and lazy-compiled chunks) and is irrelevant to this assertion.
    await page.goto(`/assets?q=${encodeURIComponent(tag)}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(tag).first()).toBeVisible();
  });
});
