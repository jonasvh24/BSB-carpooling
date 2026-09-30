import { test, expect, type Page } from "@playwright/test";
import { signInAs } from "./helpers";
import { testDb } from "./db";

const EMAIL = "onboard.me@example.org";

// Photon and Nominatim are stubbed at the network edge so the test is offline-safe.
async function stubGeo(page: Page) {
  await page.route("**/api/geo/search?**", (route) =>
    route.fulfill({ json: [{ label: "Rue de la Loi 16, 1000 Bruxelles, Belgium", lat: 50.8467, lng: 4.3658 }] }),
  );
  await page.route("**/api/geo/reverse?**", (route) => route.fulfill({ json: { label: "Dragged address" } }));
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
}

test.describe.configure({ mode: "serial" });

test("completes onboarding on a 390 px viewport in under 40 interactions", async ({ page, request }) => {
  let interactions = 0;
  const click = async (name: string | RegExp, role: "button" | "radio" | "checkbox" | "link" = "button") => {
    interactions++;
    await page.getByRole(role, { name, exact: typeof name === "string" }).first().click();
  };
  const fill = async (label: string, value: string) => {
    interactions++;
    await page.getByLabel(label, { exact: true }).fill(value);
  };

  await stubGeo(page);
  await signInAs(page, request, EMAIL);
  await expect(page).toHaveURL(/\/onboarding/);
  expect(page.viewportSize()?.width).toBe(390);

  // Step 1 — About you
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
  await fill("Your name", "Onboard Me");
  await click("Dutch", "checkbox");
  await click("Next");

  // Step 2 — Where you live
  await expect(page.getByRole("heading", { name: "Where you live" })).toBeVisible();
  await fill("Your home address", "Rue de la Loi");
  await click(/Rue de la Loi 16/);
  await expect(page.getByTestId("chosen-address")).toContainText("Rue de la Loi 16");
  await click("Next");

  // Progress must survive a reload: we should be on step 3, not back at 1.
  await expect(page.getByRole("heading", { name: "Your school days" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your school days" })).toBeVisible();
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Your school days" })).toBeVisible();

  // Step 3 — School days: keep Mon–Fri, pick 08:00, 10 min earlier, 16:00, both trips.
  await click("08:00");
  await click("16:00");
  await click("Next");

  // Step 4 — Driving or riding
  await expect(page.getByRole("heading", { name: "Driving or riding" })).toBeVisible();
  await click("I'll drive", "radio");
  await fill("Car make and colour", "Grey Skoda");
  await click("2", "radio");
  await click("Next");

  // Step 5 — Preferences (defaults are fine)
  await expect(page.getByRole("heading", { name: "Preferences" })).toBeVisible();
  await click("Quiet", "radio");
  await click("Next");

  // Step 6 — Research
  await expect(page.getByRole("heading", { name: "Five minutes for the pilot" })).toBeVisible();
  await click("Car, alone", "radio");
  await fill("Typical one-way journey, door to door (minutes)", "25");
  await click("€50–100", "radio");
  await click("Never", "radio");
  await click("Save money", "radio");
  await click("Schedules", "radio");
  await click("4", "radio");
  await click("Yes", "radio");
  await click("Yes, up to €3", "radio");
  await click("Next");

  // Step 7 — Consent: with one box ticked the submit stays disabled, and the
  // app keeps redirecting to onboarding.
  await expect(page.getByRole("heading", { name: "Consent and ground rules" })).toBeVisible();
  const submit = page.getByRole("button", { name: "I agree, show my matches" });
  await expect(submit).toBeDisabled();
  await click(/Location sharing/, "checkbox");
  await expect(submit).toBeDisabled();
  await page.goto("/matches");
  await expect(page).toHaveURL(/\/onboarding/);
  await page.goto("/onboarding?step=7");
  await click(/Location sharing/, "checkbox");
  await click(/Pilot research/, "checkbox");
  await expect(submit).toBeEnabled();
  await click("I agree, show my matches");

  await expect(page).toHaveURL(/\/matches/);
  expect(interactions).toBeLessThan(40);

  // Rows written by the wizard.
  const user = await testDb.user.findUniqueOrThrow({ where: { email: EMAIL }, include: { profile: true, scheduleEntries: true, consents: true, surveyResponses: true } });
  expect(user.name).toBe("Onboard Me");
  expect(user.onboardingCompletedAt).not.toBeNull();
  expect(user.homeLat).toBeCloseTo(50.8467, 3);
  expect(user.approxLat).not.toBeNull();
  expect(user.approxLat).not.toBe(user.homeLat);
  expect(user.gender).toBeNull();
  expect(user.profile?.rideRole).toBe("DRIVER");
  expect(user.profile?.seatsAvailable).toBe(2);
  expect(user.profile?.talk).toBe("QUIET");
  expect(user.profile?.languages).toBe("nl");
  expect(user.scheduleEntries.map((s) => s.weekday).sort()).toEqual([1, 2, 3, 4, 5]);
  expect(user.scheduleEntries.every((s) => s.arriveBy === "08:00" && s.departEarliest === "16:00" && s.wantsAm && s.wantsPm)).toBe(true);
  expect(user.consents.filter((c) => c.withdrawnAt === null).map((c) => c.scope).sort()).toEqual(["LOCATION_SHARING", "PILOT_RESEARCH"]);
  const answers = JSON.parse(user.surveyResponses.find((s) => s.surveyKey === "ONBOARDING")!.answers);
  expect(answers).toMatchObject({ r1: "CAR_ALONE", r2: 25, r3: "50_100", r7: 4, r8: "YES", r9: "UP_TO_3" });
});
