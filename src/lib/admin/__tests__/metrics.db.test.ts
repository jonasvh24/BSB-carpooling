import { beforeAll, describe, expect, it, vi } from "vitest";
import { stubRouter } from "@/lib/matching/__tests__/fixtures";

vi.mock("@/lib/geo/provider", () => ({
  route: stubRouter,
  routeGeometry: async (points: { lat: number; lng: number }[]) => ({ ...(await stubRouter(points)), geometry: points.map((p) => [p.lat, p.lng]) }),
  geocode: async () => [],
  reverseGeocode: async () => "Stub address",
}));
vi.mock("@/lib/mail", () => ({ sendMail: async () => {}, devMailbox: () => [] }));

import { db } from "@/lib/db";
import { at } from "@/lib/matching/__tests__/fixtures";
import { makeOrg, makePool, makeUser, resetDb } from "@/test/factory";
import { computeMetrics, heatCells } from "@/lib/admin/metrics";
import { deleteUserCascade } from "@/lib/gdpr";
import { recomputeOrg } from "@/lib/matching-service";
import { todayInZone, addDaysIso, isoWeekday } from "@/lib/time";

// A small organisation whose numbers can be computed by hand:
//   headcount 10; 4 sign-ups of which 3 completed; driver + 2 passengers on the
//   same corridor; one active pool (driver + p1); this week: 2 DONE trips
//   (p1 in, car alone, 5 km direct each), 1 CANCELLED, 1 PLANNED.
describe("admin metrics (§8.2)", () => {
  let orgId: string;
  let driverId: string;
  let p1: string;
  let today: string;

  beforeAll(async () => {
    await resetDb();
    const { org, site } = await makeOrg();
    orgId = org.id;
    await db.organisation.update({ where: { id: orgId }, data: { headcount: 10 } });
    driverId = (await makeUser(orgId, site.id, "d@example.org", at(10), { role: "DRIVER", r1: "CAR_ALONE" })).id;
    p1 = (await makeUser(orgId, site.id, "p1@example.org", at(5), { role: "PASSENGER", r1: "CAR_ALONE" })).id;
    await makeUser(orgId, site.id, "p2@example.org", at(6, 0.5), { role: "PASSENGER", r1: "BIKE" });
    // Signed up, not onboarded.
    await db.user.create({ data: { orgId, email: "new@example.org", name: "" } });
    await recomputeOrg(orgId);
    await makePool(orgId, site.id, driverId, [p1]);
    await db.pool.create({ data: { orgId, siteId: site.id, direction: "PM", name: "old", status: "ENDED", endedAt: new Date(), members: { create: { userId: driverId, memberRole: "DRIVER", days: "1", status: "LEFT" } } } });

    today = todayInZone("Europe/Brussels");
    const monday = addDaysIso(today, 1 - isoWeekday(today));
    const pool = await db.pool.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const trip = (date: string, status: string, kmSaved?: number) =>
      db.trip.create({ data: { poolId: pool.id, date, direction: "AM", driverId, plannedDepart: "07:50", status, verified: status === "DONE", kmSaved: kmSaved ?? null, participants: { create: [{ userId: driverId, status: "IN" }, { userId: p1, status: status === "DONE" ? "IN" : "IN" }] } } });
    await trip(monday, "DONE", 5);
    await trip(addDaysIso(monday, 1), "DONE", 5);
    await trip(addDaysIso(monday, 2), "CANCELLED");
    await trip(addDaysIso(monday, 3), "PLANNED");
    await db.surveyResponse.create({ data: { userId: p1, surveyKey: "WEEK4", answers: JSON.stringify({ recommend: 5, tripsSoFar: 2 }) } });
  });

  it("matches hand-computed values", async () => {
    const m = await computeMetrics(orgId, { withDiagnostics: true });
    expect(m.signups).toBe(4);
    expect(m.completed).toBe(3);
    expect(m.values.signupRate).toBeCloseTo(0.4);
    expect(m.values.onboarding).toBeCloseTo(0.75);
    expect(m.roleSplit).toEqual({ DRIVER: 1, PASSENGER: 2, EITHER: 0 });
    expect(m.siteSplit).toEqual([{ site: "Campus", users: 3 }]);
    // All three are in matches with detour ≤ 10 min.
    expect(m.matchable).toBe(3);
    expect(m.values.matchable).toBeCloseTo(1);
    expect(m.unmatched).toEqual({ NO_SCHEDULE: 0, NO_DRIVERS: 0, NO_CANDIDATE_IN_CORRIDOR: 0, TIME_MISMATCH: 0, CAPACITY: 0 });
    expect(m.pools).toEqual({ active: 1, paused: 0, ended: 1, forming: 0, avgSize: 2 });
    expect(m.values.poolSurvival).toBeCloseTo(0.5);
    expect(m.values.poolConversion).toBeCloseTo(2 / 3);
    expect(m.trips.planned).toBe(4);
    expect(m.trips.done).toBe(2);
    expect(m.trips.cancelled).toBe(1);
    expect(m.trips.cancellationRate).toBeCloseTo(0.25);
    expect(m.trips.noShowRate).toBe(0);
    expect(m.trips.cadence).toBeCloseTo(2);
    expect(m.impact.kmSaved).toBe(10);
    expect(m.impact.co2Kg).toBe(1.3); // 10 km × 130 g
    expect(m.impact.moneyEur).toBe(4); // 10 km × 40 c
    expect(m.impact.parkingFreed).toBe(1); // p1 (car alone); p2 never rode
    expect(m.survey.n).toBe(3);
    expect(m.survey.r1).toEqual({ CAR_ALONE: 2, BIKE: 1 });
    expect(m.survey.r8).toEqual({ YES: 3 });
    expect(m.values.commercial).toBeCloseTo(1);
    expect(m.week4).toEqual({ n: 1, recommend: 1 });
    const byKey = Object.fromEntries(m.goNoGo.map((g) => [g.key, g.ok]));
    expect(byKey).toEqual({ signupRate: true, onboarding: false, matchable: true, poolConversion: true, poolSurvival: false, tripCadence: false, cancellation: false, recommend: true, commercial: true });
  });

  it("heat map only shows cells with at least two users", async () => {
    const cells = await heatCells(orgId);
    // d (10 km), p1 (5 km) and p2 (6 km, 0.5 km east): no two homes share a 1 km cell;
    // p1 and p2 share a 3 km cell as singletons.
    expect(cells.every((c) => c.count >= 2)).toBe(true);
    expect(cells.some((c) => c.coarse && c.count === 2)).toBe(true);
  });

  it("deleting a user removes their rows and anonymises trip history", async () => {
    const before = await db.tripParticipant.count({ where: { userId: p1 } });
    expect(before).toBe(4);
    await deleteUserCascade(p1);
    expect(await db.user.findUnique({ where: { id: p1 } })).toBeNull();
    expect(await db.commuteProfile.findUnique({ where: { userId: p1 } })).toBeNull();
    expect(await db.scheduleEntry.count({ where: { userId: p1 } })).toBe(0);
    expect(await db.match.count({ where: { OR: [{ driverId: p1 }, { passengerId: p1 }] } })).toBe(0);
    expect(await db.surveyResponse.count({ where: { userId: p1 } })).toBe(0);
    expect(await db.consent.count({ where: { userId: p1 } })).toBe(0);
    expect(await db.poolMember.count({ where: { userId: p1 } })).toBe(0);
    // Trips survive with an anonymised participant.
    expect(await db.trip.count()).toBe(4);
    const anon = await db.tripParticipant.findMany({ where: { userId: null } });
    expect(anon).toHaveLength(4);
    expect(anon.every((a) => a.anonymisedId?.startsWith("deleted-"))).toBe(true);
    // Deleting the driver ends their pool and keeps DONE trips.
    await deleteUserCascade(driverId);
    expect((await db.pool.findFirstOrThrow({ where: { name: "Test pool" } })).status).toBe("ENDED");
    expect(await db.trip.count({ where: { status: "DONE" } })).toBe(2);
    expect(await db.trip.count({ where: { driverId: null } })).toBe(4);
  });
});
