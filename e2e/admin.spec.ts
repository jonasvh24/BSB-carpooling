import { test, expect } from "@playwright/test";
import { testDb } from "./db";
import { at, makeOnboardedUser } from "./factory";

test.describe.configure({ mode: "serial" });

// Admin dashboard, invitation and exports. The admin row is created by the seed.
test("admin can read the dashboard, invite by CSV and export", async ({ browser, request }) => {
  const admin = await testDb.user.findUniqueOrThrow({ where: { email: "admin@example.org" } });
  await testDb.user.update({ where: { id: admin.id }, data: { name: "Pilot Admin", onboardingCompletedAt: new Date() } });
  await testDb.consent.createMany({ data: [{ userId: admin.id, scope: "LOCATION_SHARING", policyVersion: "1" }, { userId: admin.id, scope: "PILOT_RESEARCH", policyVersion: "1" }] });

  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.goto(`/dev/login-as/${admin.id}`);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Sign-up rate").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Go / no-go" })).toBeVisible();

  await page.goto("/admin/users");
  await page.getByLabel("Invite by CSV").fill("new.one@elsewhere.com\nnew.two@elsewhere.com, bad-address");
  await page.getByRole("button", { name: "Invite by CSV" }).click();
  await expect(page.getByText("2 addresses invited.")).toBeVisible();
  expect(await testDb.invitation.count({ where: { email: { in: ["new.one@elsewhere.com", "new.two@elsewhere.com"] } } })).toBe(2);

  // Exports are CSV with a header row.
  const cookies = await ctx.cookies();
  const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  for (const kind of ["users", "matches", "trips", "survey"]) {
    const res = await request.get(`/admin/export/${kind}`, { headers: { cookie } });
    expect(res.status(), kind).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/csv");
  }
  const users = await (await request.get("/admin/export/users", { headers: { cookie } })).text();
  expect(users.split("\n")[0]).toContain("email,name,role,status");
  expect(await testDb.auditLog.count({ where: { action: "EXPORT" } })).toBeGreaterThanOrEqual(4);

  // A member cannot reach /admin.
  const member = await makeOnboardedUser("mia.member@example.org", at(3), "PASSENGER");
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await mctx.newPage();
  await mpage.goto(`/dev/login-as/${member.id}`);
  await mpage.goto("/admin");
  await expect(mpage).not.toHaveURL(/\/admin/);
  await mctx.close();
  await ctx.close();
});
