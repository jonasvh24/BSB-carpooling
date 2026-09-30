import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers";

test("refuses an address outside the allowed domains", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("School email address").fill("someone@elsewhere.com");
  await page.getByRole("button", { name: "Send me a sign-in link" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("not on the list");
});

test("signs in with a magic link and lands in onboarding", async ({ page, request }) => {
  await signInAs(page, request, "teacher.one@example.org");
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
});
