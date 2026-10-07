import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers";
import { testDb } from "./db";

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

test("the sign-in confirmation never puts the address in the URL", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("School email address").fill("teacher.two@example.org");
  await page.getByRole("button", { name: "Send me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(page.url()).not.toContain("teacher");
  expect(page.url()).not.toContain("%40");
});

test("the owner account signs in with a password and is an administrator; a wrong password is refused", async ({ page }) => {
  const ownerForm = async (password: string) => {
    await page.goto("/signin");
    await page.getByText("Owner sign-in (no school email)").click();
    await page.getByLabel("Email address", { exact: true }).fill("owner@outside.test");
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  };
  await ownerForm("wrong");
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("do not match");
  expect(await testDb.user.count({ where: { email: "owner@outside.test" } })).toBe(0);
  await ownerForm("e2e-owner-password");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  expect((await testDb.user.findUniqueOrThrow({ where: { email: "owner@outside.test" } })).role).toBe("ADMIN");
});

test("security headers are sent with every page", async ({ request }) => {
  const res = await request.get("/signin");
  const h = res.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-powered-by"]).toBeUndefined();
});
