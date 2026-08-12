import { expect, type Page } from "@playwright/test";

/**
 * Log in via the credentials form on /login and wait for the dashboard.
 * The password is read from process.env[passwordEnvVar] (loaded from .env
 * by playwright.config.ts) so secrets never appear in test source.
 */
export async function login(page: Page, email: string, passwordEnvVar: string): Promise<void> {
  const password = process.env[passwordEnvVar];
  if (!password) {
    throw new Error(`Environment variable ${passwordEnvVar} is not set (expected in .env)`);
  }
  // On a cold dev server the first credentials POST can fail while routes
  // compile, so retry the whole form flow a couple of times.
  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "เข้าสู่ระบบ / Sign in" }).click();
    try {
      // First compile of /dashboard on the dev server can be slow.
      await page.waitForURL("**/dashboard", { timeout: 20_000 });
      await expect(page.locator("body")).toBeVisible();
      return;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
    }
  }
}
