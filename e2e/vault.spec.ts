import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("vault", () => {
  test("create MEDIUM secret, reveal without MFA, then hide", async ({ page }) => {
    await login(page, "itmanager@example.com", "SEED_USER_PASSWORD");

    const ts = Date.now();
    const name = `E2E Secret ${ts}`;
    const secretValue = `E2e-Pa55w0rd-${ts}`;

    await page.goto("/vault/new");
    await page.locator("input[name=name]").fill(name);
    // MEDIUM classification (default, set explicitly) — must not require MFA
    await page.locator("select[name=classification]").selectOption("MEDIUM");
    await page.locator("input[name=password]").fill(secretValue);
    await page.getByRole("button", { name: "บันทึก / Save" }).click();

    // Server action redirects to /vault/<id> (must not stay on /vault/new)
    await page.waitForURL(/\/vault\/(?!new$)[^/?#]+$/, { timeout: 30_000 });
    await expect(page.getByText(name).first()).toBeVisible();

    // Reveal — MEDIUM shows no confirm dialog and no MFA prompt
    await page.getByRole("button", { name: "เปิดเผย / Reveal" }).click();
    await expect(page.getByText(secretValue)).toBeVisible();

    // Hide — revealed value must disappear
    await page.getByRole("button", { name: /ซ่อน \/ Hide/ }).click();
    await expect(page.getByText(secretValue)).toHaveCount(0);
  });
});
