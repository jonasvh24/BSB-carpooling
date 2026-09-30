import type { Page, APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

// Signs in through the real magic-link flow, reading the link from the dev mailbox.
export async function signInAs(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/signin");
  await page.getByLabel("School email address").fill(email);
  await page.getByRole("button", { name: "Send me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const res = await request.get(`/dev/mailbox/api?to=${encodeURIComponent(email)}`);
  const mails = (await res.json()) as Array<{ text: string }>;
  const link = mails[0]?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error("No magic link in dev mailbox");
  await page.goto(link);
}
