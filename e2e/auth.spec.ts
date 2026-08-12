import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("authentication", () => {
  test("wrong password shows an error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill("itmanager@example.com");
    await page.locator("#password").fill("definitely-not-the-password");
    await page.getByRole("button", { name: "เข้าสู่ระบบ / Sign in" }).click();

    await expect(page.getByText("ไม่ถูกต้อง")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("valid login redirects to /dashboard and shows vault nav", async ({ page }) => {
    await login(page, "itmanager@example.com", "SEED_USER_PASSWORD");
    expect(new URL(page.url()).pathname).toBe("/dashboard");
    await expect(page.getByRole("link", { name: "ตู้เซฟรหัสผ่าน" })).toBeVisible();
  });

  test("unauthenticated visit to /assets redirects to /login", async ({ page }) => {
    await page.goto("/assets");
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe("/login");
  });
});
