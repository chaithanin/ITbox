import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("rbac (employee role)", () => {
  test("employee has no audit nav and cannot access user management", async ({ page }) => {
    await login(page, "employee@example.com", "SEED_USER_PASSWORD");

    // Sidebar must NOT contain the audit-log entry
    await expect(page.getByRole("link", { name: "ตู้เซฟรหัสผ่าน" })).toBeVisible();
    await expect(page.getByRole("link", { name: "บันทึกตรวจสอบ" })).toHaveCount(0);

    // Direct navigation to user management must not expose the create-user form
    await page.goto("/settings/users");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("สร้างผู้ใช้ใหม่")).toHaveCount(0);
  });
});
