import { test, expect, type Browser, type Page } from "@playwright/test";
import { testDb } from "./db";
import { at, makeOnboardedUser } from "./factory";

test.describe.configure({ mode: "serial" });

async function loginAs(browser: Browser, userId: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
  await page.goto(`/dev/login-as/${userId}`);
  await page.waitForURL(/\/(matches|onboarding|pools)/);
  return page;
}

let driverId: string;
let passengerId: string;

test.beforeAll(async ({ request }) => {
  driverId = (await makeOnboardedUser("dana.driver@example.org", at(10), "DRIVER")).id;
  passengerId = (await makeOnboardedUser("pat.passenger@example.org", at(5, 1), "PASSENGER")).id;
  await request.get("/dev/recompute");
});

test("a schedule change updates matches immediately", async ({ browser }) => {
  const page = await loginAs(browser, passengerId);
  await page.goto("/matches");
  await expect(page.getByRole("heading", { name: "dana driver" })).toBeVisible();

  // Move the passenger to a 06:00 hard arrival and a 22:00 hard departure:
  // no common window with the driver in either direction.
  await page.goto("/schedule");
  await page.getByRole("button", { name: "Custom" }).nth(0).click();
  await page.locator("#arriveBy").fill("06:00");
  await page.getByRole("radio", { name: "0 min" }).nth(0).check();
  await page.getByRole("button", { name: "Custom" }).nth(1).click();
  await page.locator("#departEarliest").fill("22:00");
  await page.getByRole("radio", { name: "0 min" }).nth(1).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/schedule\?saved=1/);
  await page.goto("/matches");
  await expect(page.getByText("No matches yet.")).toBeVisible();

  // And back.
  await page.goto("/schedule");
  await page.getByRole("button", { name: "08:15" }).click();
  await page.getByRole("radio", { name: "10 min" }).nth(0).check();
  await page.getByRole("button", { name: "16:30" }).click();
  await page.getByRole("radio", { name: "30 min" }).nth(0).check();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/schedule\?saved=1/);
  await page.goto("/matches");
  await expect(page.getByRole("heading", { name: "dana driver" })).toBeVisible();
  await page.context().close();
});

test("passenger requests, driver accepts, both see the weekday plan", async ({ browser }) => {
  const passenger = await loginAs(browser, passengerId);
  await passenger.goto("/matches");
  await passenger.getByRole("button", { name: "Ask to join" }).first().click();
  await passenger.getByLabel("Message").fill("Happy to chip in for fuel.");
  await passenger.getByRole("button", { name: "Send request" }).click();
  await expect(passenger.getByText("Request sent")).toBeVisible();

  const driver = await loginAs(browser, driverId);
  await driver.goto("/requests");
  await expect(driver.getByText("From pat passenger")).toBeVisible();
  await expect(driver.getByText("Happy to chip in for fuel.")).toBeVisible();
  await driver.getByRole("button", { name: "Accept" }).click();
  await expect(driver).toHaveURL(/\/pools\/[a-z0-9]+\?joined=1/);
  await expect(driver.getByText("Driver leaves")).toBeVisible();
  await expect(driver.getByText("Arrive at school")).toBeVisible();
  const poolUrl = driver.url().split("?")[0];

  // The passenger sees the same plan, with the driver's phone (pool members only).
  await passenger.goto(poolUrl);
  await expect(passenger.getByText("Driver leaves")).toBeVisible();
  await expect(passenger.getByText("+32 470 00 00 00").first()).toBeVisible();

  const pool = await testDb.pool.findFirstOrThrow({ where: { id: poolUrl.split("/").pop() }, include: { members: true } });
  expect(pool.status).toBe("ACTIVE");
  expect(pool.members.map((m) => m.memberRole).sort()).toEqual(["DRIVER", "PASSENGER"]);
  const match = await testDb.match.findFirstOrThrow({ where: { driverId, passengerId } });
  expect(match.status).toBe("CONVERTED");

  // A stranger cannot read the pool.
  const stranger = await makeOnboardedUser("sam.stranger@example.org", at(20), "PASSENGER");
  const other = await loginAs(browser, stranger.id);
  await other.goto(poolUrl);
  await expect(other).toHaveURL(/\/pools$/);

  await passenger.context().close();
  await driver.context().close();
  await other.context().close();
});

test("the 18:00 job creates tomorrow's trip and the digest; driver cancel notifies and offers lifts", async ({ browser, request }) => {
  // A second driver near the corridor who can offer a lift.
  const spare = await makeOnboardedUser("sven.spare@example.org", at(9, 0.5), "DRIVER");
  await request.get("/dev/recompute");
  const res = await request.get("/dev/jobs?run=digest&now=2026-09-20T16:00:00Z");
  const [out] = (await res.json()) as Array<{ date: string; created: number; sent: number }>;
  expect(out.date).toBe("2026-09-21");
  expect(out.created).toBe(1);
  expect(out.sent).toBe(2);

  const trip = await testDb.trip.findFirstOrThrow({ where: { date: "2026-09-21" } });
  const driver = await loginAs(browser, driverId);
  await driver.goto("/notifications");
  await expect(driver.getByText(/Tomorrow you drive at/)).toBeVisible();
  await driver.goto(`/trips/${trip.id}`);
  await driver.getByRole("button", { name: "Cancel this trip" }).click();
  await expect(driver.getByText("Cancelled").first()).toBeVisible();

  const passenger = await loginAs(browser, passengerId);
  await passenger.goto("/notifications");
  await expect(passenger.getByText(/Trip cancelled/)).toBeVisible();
  await passenger.goto(`/trips/${trip.id}`);
  await expect(passenger.getByText("The driver has cancelled this trip.")).toBeVisible();
  await expect(passenger.getByText("sven spare")).toBeVisible();
  await expect(passenger.getByRole("link", { name: "Public transport options" })).toBeVisible();
  void spare;

  await driver.context().close();
  await passenger.context().close();
});
