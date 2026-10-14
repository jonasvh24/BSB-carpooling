import type { Page, APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

export const E2E_PASSWORD = "e2e-password-123";

// Signs in with the password, or, the first time, creates the account through the real
// two-step sign-up form, reading the emailed code from the development mailbox.
export async function signInAs(page: Page, _request: APIRequestContext, email: string) {
  await page.goto("/signin");
  await page.getByLabel("School email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const wrong = page.getByRole("alert").filter({ hasText: "do not match" });
  const outcome = await Promise.race([
    page.waitForURL((u) => !/^\/signin\/?$/.test(u.pathname), { timeout: 30_000 }).then(() => "signedIn" as const),
    wrong.waitFor({ timeout: 30_000 }).then(() => "noAccount" as const),
  ]);
  if (outcome === "noAccount") {
    await page.goto("/signin/new");
    await page.getByLabel("School email address").fill(email);
    await page.getByRole("button", { name: "Email me a code" }).click();
    await page.getByLabel("Six-digit code").waitFor();
    await page.getByLabel("Six-digit code").fill(await latestCode(page, email));
    await page.getByLabel("Choose a password").fill(E2E_PASSWORD);
    await page.getByLabel("Repeat the password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
  }
  await expect(page).not.toHaveURL(/\/signin(\/new)?$/);
}

export async function latestCode(page: Page, email: string): Promise<string> {
  const res = await page.request.get(`/dev/mailbox/api?to=${encodeURIComponent(email)}`);
  const mails = (await res.json()) as Array<{ subject: string }>;
  const code = mails.map((m) => m.subject.match(/code: (\d{6})/)?.[1]).find(Boolean);
  if (!code) throw new Error(`no sign-up code in the mailbox for ${email}`);
  return code;
}
