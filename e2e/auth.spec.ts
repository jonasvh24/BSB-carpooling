import { test, expect } from "@playwright/test";
import { E2E_PASSWORD, latestCode, signInAs } from "./helpers";
import { testDb } from "./db";

test("refuses an address outside the allowed domains", async ({ page }) => {
  await page.goto("/signin/new");
  await page.getByLabel("School email address").fill("someone@elsewhere.com");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("not on the list");
  expect(await testDb.user.count({ where: { email: "someone@elsewhere.com" } })).toBe(0);
});

test("sign-up needs the emailed code; a wrong code creates nothing", async ({ page }) => {
  const email = "teacher.code@example.org";
  await page.goto("/signin/new");
  await page.getByLabel("School email address").fill(email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Six-digit code").waitFor();
  const code = await latestCode(page, email);
  await page.getByLabel("Six-digit code").fill(code === "000000" ? "111111" : "000000");
  await page.getByLabel("Choose a password").fill(E2E_PASSWORD);
  await page.getByLabel("Repeat the password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("wrong or has expired");
  expect(await testDb.user.count({ where: { email } })).toBe(0);
  // The form clears after each submit.
  await page.getByLabel("Six-digit code").fill(code);
  await page.getByLabel("Choose a password").fill(E2E_PASSWORD);
  await page.getByLabel("Repeat the password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
});

test("a seeded administrator cannot be claimed without the code from their mailbox", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("School email address").fill("admin@example.org");
  await page.getByLabel("Password", { exact: true }).fill("attacker-guess");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Same answer as for any wrong password: no "this account has no password yet" hint.
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("do not match");
  await page.goto("/signin/new");
  await page.getByLabel("School email address").fill("admin@example.org");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Six-digit code").fill((await latestCode(page, "admin@example.org").catch(() => "")) === "123456" ? "654321" : "123456");
  await page.getByLabel("Choose a password").fill("attacker-password");
  await page.getByLabel("Repeat the password").fill("attacker-password");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("wrong or has expired");
  expect((await testDb.user.findUniqueOrThrow({ where: { email: "admin@example.org" } })).passwordHash).toBeNull();
});

test("creates an account with a password and lands in onboarding", async ({ page, request }) => {
  await signInAs(page, request, "teacher.one@example.org");
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
  const user = await testDb.user.findUniqueOrThrow({ where: { email: "teacher.one@example.org" } });
  expect(user.passwordHash).toMatch(/^scrypt\$/);
});

test("signs in again with the password; a wrong password is refused", async ({ page, request }) => {
  await signInAs(page, request, "teacher.two@example.org");
  await page.goto("/api/auth/signout");
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.goto("/signin");
  await page.getByLabel("School email address").fill("teacher.two@example.org");
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("do not match");
  // The form clears after each submit.
  await page.getByLabel("School email address").fill("teacher.two@example.org");
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding/);
});

test("the sign-in pages never put the address in the URL", async ({ page }) => {
  await page.goto("/signin");
  await page.getByLabel("School email address").fill("teacher.three@example.org");
  await page.getByLabel("Password", { exact: true }).fill("whatever-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toBeVisible();
  expect(page.url()).not.toContain("teacher");
  expect(page.url()).not.toContain("%40");
});

test("the owner account signs in with the password from .env and is an administrator", async ({ page }) => {
  const ownerForm = async (password: string) => {
    await page.goto("/signin");
    await page.getByLabel("School email address").fill("owner@outside.test");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  };
  await ownerForm("wrong");
  await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("do not match");
  expect(await testDb.user.count({ where: { email: "owner@outside.test" } })).toBe(0);
  await ownerForm("e2e-owner-password");
  await expect(page).toHaveURL(/\/(admin|onboarding)/);
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
