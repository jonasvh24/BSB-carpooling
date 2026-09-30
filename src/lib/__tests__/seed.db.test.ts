import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mail", () => ({ sendMail: async () => {}, devMailbox: () => [] }));

import { db } from "@/lib/db";
import { resetDb } from "@/test/factory";
import { purgeSeed, seedOrg, seedStaff } from "../../../prisma/seed";

describe("seed and purge (§11.1, phase 5)", () => {
  it("seeds 40 staff and purge leaves only real users", async () => {
    await resetDb();
    process.env.ORG_NAME = "Seed School";
    process.env.ALLOWED_EMAIL_DOMAINS = "example.org";
    process.env.ADMIN_EMAILS = "admin@example.org";
    await seedOrg();
    await seedStaff(40);
    const seeded = await db.user.findMany({ where: { isSeed: true }, include: { profile: true, scheduleEntries: true, consents: true, surveyResponses: true } });
    expect(seeded).toHaveLength(40);
    expect(seeded.every((u) => u.onboardingCompletedAt && u.profile && u.scheduleEntries.length >= 2 && u.consents.length === 2 && u.surveyResponses.length === 1)).toBe(true);
    expect(seeded.every((u) => u.email.match(/^seed-\d\d@example\.org$/))).toBe(true);
    expect(seeded.filter((u) => u.gender).every((u) => u.profile?.genderPref === "SAME")).toBe(true);
    expect(await db.nonWorkingDay.count()).toBe(5);

    // A real user who carpooled with a seed user keeps their account; the pool goes.
    const real = await db.user.create({ data: { orgId: seeded[0].orgId, email: "real@example.org", name: "Real" } });
    const site = await db.site.findFirstOrThrow();
    await db.pool.create({ data: { orgId: real.orgId, siteId: site.id, direction: "AM", name: "mixed", members: { create: [{ userId: seeded[0].id, memberRole: "DRIVER", days: "1" }, { userId: real.id, memberRole: "PASSENGER", days: "1" }] } } });

    await purgeSeed(false);
    const remaining = await db.user.findMany();
    expect(remaining.map((u) => u.email).sort()).toEqual(["admin@example.org", "real@example.org"]);
    expect(await db.pool.count()).toBe(0);
    expect(await db.commuteProfile.count()).toBe(0);
    expect(await db.scheduleEntry.count()).toBe(0);
    expect(await db.surveyResponse.count()).toBe(0);
  });
});
