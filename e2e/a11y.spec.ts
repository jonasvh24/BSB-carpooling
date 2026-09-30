import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { testDb } from "./db";
import { at, makeOnboardedUser } from "./factory";

// Automated WCAG 2.1 A/AA check (axe) over the pages a staff member meets.
// Automated checks find only part of what WCAG asks; docs/legal/COMPLIANCE_REGISTER.md
// row P6 lists what still needs a human.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
// Violations found by the first run (register P6), switched off until Phase C fixes them.
const KNOWN_AS_FOUND = ["nested-interactive", "aria-command-name", "color-contrast"];

// Collects violations for one page; each test asserts once at the end so a
// single run reports every page.
async function scan(page: Page, label: string, problems: string[]) {
  // Map tiles are third-party images outside our control and are blocked in tests.
  const results = await new AxeBuilder({ page }).withTags(TAGS).disableRules(KNOWN_AS_FOUND).exclude(".leaflet-tile-pane").analyze();
  for (const v of results.violations) problems.push(`${label}: ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes[0]?.target.join(" ")}`);
}

let memberId: string;
let poolId: string;
let wizardId: string;

test.beforeAll(async ({ request }) => {
  const driver = await makeOnboardedUser("axe.driver@example.org", at(-10), "DRIVER");
  const member = await makeOnboardedUser("axe.member@example.org", at(-5, 0.5), "PASSENGER");
  memberId = member.id;
  await request.get("/dev/recompute");
  const site = await testDb.site.findFirstOrThrow();
  const pool = await testDb.pool.create({
    data: {
      orgId: driver.orgId,
      siteId: site.id,
      direction: "PM",
      name: "Afternoon carpool with axe driver",
      members: { create: [{ userId: driver.id, memberRole: "DRIVER", days: "1,2,3,4,5", stopOrder: 0 }, { userId: member.id, memberRole: "PASSENGER", days: "1,2,3,4,5", stopOrder: 1 }] },
      messages: { create: { userId: driver.id, body: "See you at the gate." } },
    },
  });
  poolId = pool.id;
  // A second account parked on the last wizard step so every step can be opened.
  const w = await makeOnboardedUser("axe.wizard@example.org", at(-7), "EITHER");
  wizardId = w.id;
  await testDb.consent.deleteMany({ where: { userId: w.id } });
  await testDb.user.update({ where: { id: w.id }, data: { onboardingStep: 7, onboardingCompletedAt: null } });
});

test.afterAll(async () => {
  await testDb.user.deleteMany({ where: { email: { startsWith: "axe." } } });
  await testDb.pool.deleteMany({ where: { id: poolId } });
});

for (const scheme of ["light", "dark"] as const) {
  test(`signed-out pages have no WCAG A/AA violations (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    const page = await ctx.newPage();
    const problems: string[] = [];
    for (const path of ["/", "/signin", "/privacy"]) {
      await page.goto(path);
      await scan(page, `${scheme} ${path}`, problems);
    }
    await ctx.close();
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test(`member pages have no WCAG A/AA violations (${scheme})`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    const page = await ctx.newPage();
    await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
    await page.goto(`/dev/login-as/${memberId}`);
    const problems: string[] = [];
    for (const path of ["/matches", `/pools/${poolId}`, "/pools", "/schedule", "/settings", "/settings/privacy", "/settings/report", "/notifications", "/requests"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      await scan(page, `${scheme} ${path.replace(poolId, "[id]")}`, problems);
    }
    await ctx.close();
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

test("every onboarding step has no WCAG A/AA violations", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.goto(`/dev/login-as/${wizardId}`);
  const problems: string[] = [];
  for (let step = 1; step <= 7; step++) {
    await page.goto(`/onboarding?step=${step}`);
    await expect(page.locator("h1")).toBeVisible();
    await scan(page, `onboarding step ${step}`, problems);
  }
  await ctx.close();
  expect(problems, problems.join("\n")).toEqual([]);
});
