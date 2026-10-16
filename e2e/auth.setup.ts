import { expect, test as setup } from "@playwright/test";
import { E2E_AUTH_STATE, E2E_USER } from "./config";

setup("sign in as the seeded admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_USER.email);
  await page.getByLabel("Password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("/");
  await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
  await page.context().storageState({ path: E2E_AUTH_STATE });
});
