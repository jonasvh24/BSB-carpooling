import type { Page, APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

export const E2E_PASSWORD = "e2e-password-123";

// Creates the account through the real sign-up form (no email confirmation) and
// lands signed in. A second call for the same address signs in instead.
export async function signInAs(page: Page, _request: APIRequestContext, email: string) {
  await page.goto("/signin/new");
  await page.getByLabel("School email address").fill(email);
  await page.getByLabel("Choose a password").fill(E2E_PASSWORD);
  await page.getByLabel("Repeat the password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "already exists" });
  if (await alert.isVisible().catch(() => false)) {
    await page.goto("/signin");
    await page.getByLabel("School email address").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await expect(page).not.toHaveURL(/\/signin(\/new)?$/);
}
