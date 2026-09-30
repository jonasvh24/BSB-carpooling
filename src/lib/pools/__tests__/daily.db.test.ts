import { beforeEach, describe, expect, it, vi } from "vitest";
import { stubRouter } from "@/lib/matching/__tests__/fixtures";

// Geo and mail never touch the network in tests. vi.mock is hoisted.
vi.mock("@/lib/geo/provider", () => ({
  route: stubRouter,
  routeGeometry: async (points: { lat: number; lng: number }[]) => ({ ...(await stubRouter(points)), geometry: points.map((p) => [p.lat, p.lng]) }),
  geocode: async () => [],
  reverseGeocode: async () => "Stub address",
}));
vi.mock("@/lib/mail", () => ({ sendMail: async () => {}, devMailbox: () => [] }));
import { makeOrg, makePool, makeUser, resetDb } from "@/test/factory";
import { db } from "@/lib/db";
import { at } from "@/lib/matching/__tests__/fixtures";
import { jobDigest, jobVerification } from "@/lib/jobs";
import { driverCancel, confirmTrip, verifyTrip, autoCloseTrips } from "@/lib/pools/daily";
import { liftsFor } from "@/lib/pools/lifts";
import { monthlyTally } from "@/lib/pools/tally";
import { acceptRequest } from "@/lib/pools/service";

// Sunday 2026-09-20 18:00 Brussels → tomorrow is Monday 2026-09-21.
const SUNDAY_1800 = new Date("2026-09-20T16:00:00Z");
const MONDAY = "2026-09-21";

describe("daily engine (§7.4–7.6)", () => {
  let orgId: string;
  let siteId: string;
  let driverId: string;
  let passengerId: string;

  beforeEach(async () => {
    await resetDb();
    const { org, site } = await makeOrg();
    orgId = org.id;
    siteId = site.id;
    driverId = (await makeUser(orgId, siteId, "driver@example.org", at(10), { role: "DRIVER" })).id;
    passengerId = (await makeUser(orgId, siteId, "pass@example.org", at(5, 1), { role: "PASSENGER" })).id;
    await makePool(orgId, siteId, driverId, [passengerId]);
  });

  it("18:00 job creates tomorrow's trip with participants and digest notifications", async () => {
    const r = await jobDigest(orgId, SUNDAY_1800);
    expect(r.date).toBe(MONDAY);
    expect(r.created).toBe(1);
    expect(r.sent).toBe(2);
    const trip = await db.trip.findFirstOrThrow({ where: { date: MONDAY }, include: { participants: true } });
    expect(trip.status).toBe("PLANNED");
    expect(trip.driverId).toBe(driverId);
    expect(trip.participants.map((p) => p.status)).toEqual(["IN", "IN"]);
    // 08:15 flex 15 → target 08:10; driver 10 km + pickup detour at 30 km/h.
    expect(trip.plannedDepart < "08:00").toBe(true);
    const digests = await db.notification.findMany({ where: { kind: "DAILY_DIGEST" } });
    expect(digests.map((n) => n.userId).sort()).toEqual([driverId, passengerId].sort());
    // Idempotent: running again creates nothing new and sends nothing new.
    const again = await jobDigest(orgId, SUNDAY_1800);
    expect(again.created).toBe(0);
    expect(again.sent).toBe(0);
  });

  it("a NonWorkingDay produces no trips", async () => {
    await db.nonWorkingDay.create({ data: { orgId, date: MONDAY, label: "Holiday" } });
    const r = await jobDigest(orgId, SUNDAY_1800);
    expect(r.date).toBe("2026-09-22"); // skips to Tuesday
    expect(await db.trip.count({ where: { date: MONDAY } })).toBe(0);
  });

  it("an OFF exception marks the member OUT", async () => {
    await db.scheduleException.create({ data: { userId: passengerId, date: MONDAY, kind: "OFF" } });
    await jobDigest(orgId, SUNDAY_1800);
    // With the only passenger off, no trip is materialised at all.
    expect(await db.trip.count({ where: { date: MONDAY } })).toBe(0);
  });

  it("driver confirms → CONFIRMED; driver cancels → CANCELLED, members notified, lifts offered", async () => {
    // A standalone driver nearby who could offer a lift.
    const spareId = (await makeUser(orgId, siteId, "spare@example.org", at(9, 0.5), { role: "DRIVER" })).id;
    await jobDigest(orgId, SUNDAY_1800);
    const trip = await db.trip.findFirstOrThrow({ where: { date: MONDAY } });
    await confirmTrip(trip.id, driverId);
    expect((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe("CONFIRMED");

    await driverCancel(trip.id, driverId);
    expect((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).status).toBe("CANCELLED");
    const n = await db.notification.findMany({ where: { kind: "DRIVER_CANCELLED" } });
    expect(n.map((x) => x.userId)).toEqual([passengerId]);

    const lifts = await liftsFor(passengerId, MONDAY, "AM", siteId);
    expect(lifts.map((l) => l.driverId)).toEqual([spareId]);
  });

  it("20:00 verification prompt goes to the driver; DONE computes km saved; 72 h auto-closes unverified", async () => {
    await jobDigest(orgId, SUNDAY_1800);
    const monday2000 = new Date("2026-09-21T18:00:00Z");
    const v = await jobVerification(orgId, monday2000);
    expect(v.sent).toBe(1);
    const trip = await db.trip.findFirstOrThrow({ where: { date: MONDAY } });
    await verifyTrip(trip.id, driverId, "DONE");
    const done = await db.trip.findUniqueOrThrow({ where: { id: trip.id } });
    expect(done.status).toBe("DONE");
    expect(done.verified).toBe(true);
    // Passenger direct ≈ 5.1 km (car alone) minus driver detour ≈ 0.2 km.
    expect(done.kmSaved).toBeGreaterThan(4.5);
    expect(done.kmSaved).toBeLessThan(5.2);

    // Another, older trip left unanswered is closed unverified.
    const old = await db.trip.create({ data: { poolId: trip.poolId, date: "2026-09-14", direction: "AM", driverId, plannedDepart: "07:50", status: "CONFIRMED", participants: { create: [{ userId: driverId, status: "IN" }, { userId: passengerId, status: "IN" }] } } });
    const closed = await autoCloseTrips(new Date("2026-09-21T10:00:00Z"));
    expect(closed).toBe(1);
    const closedTrip = await db.trip.findUniqueOrThrow({ where: { id: old.id } });
    expect(closedTrip.status).toBe("DONE");
    expect(closedTrip.verified).toBe(false);
  });

  it("cost tally matches the hand-computed case (§7.6)", async () => {
    // Passenger exactly 5 km north of the site: 5 km × 40 c ÷ 2 participants = 100 c per trip.
    const p2 = (await makeUser(orgId, siteId, "p2@example.org", at(5), { role: "PASSENGER" })).id;
    const pool = await makePool(orgId, siteId, driverId, [p2], "AM");
    for (const date of ["2026-09-21", "2026-09-22", "2026-09-23"]) {
      await db.trip.create({ data: { poolId: pool.id, date, direction: "AM", driverId, plannedDepart: "07:50", status: "DONE", verified: true, participants: { create: [{ userId: driverId, status: "IN" }, { userId: p2, status: "IN" }] } } });
    }
    const tally = await monthlyTally(pool.id, "2026-09");
    expect(tally.hidden).toBe(false);
    expect(tally.lines).toEqual([{ from: p2, to: driverId, cents: 300 }]);
  });

  it("tally is hidden when every member chose ALTERNATE", async () => {
    const d = (await makeUser(orgId, siteId, "d2@example.org", at(8), { role: "DRIVER", costMode: "ALTERNATE" })).id;
    const p = (await makeUser(orgId, siteId, "p3@example.org", at(4), { role: "PASSENGER", costMode: "ALTERNATE" })).id;
    const pool = await makePool(orgId, siteId, d, [p]);
    expect((await monthlyTally(pool.id, "2026-09")).hidden).toBe(true);
  });
});

describe("requests → pools (§7.1, §6.7)", () => {
  it("accept creates a pool, inserts stops, converts the match and notifies both", async () => {
    await resetDb();
    const { org, site } = await makeOrg();
    const d = await makeUser(org.id, site.id, "d@example.org", at(10), { role: "DRIVER", seats: 2 });
    const p1 = await makeUser(org.id, site.id, "p1@example.org", at(7, 0.5), { role: "PASSENGER" });
    const p2 = await makeUser(org.id, site.id, "p2@example.org", at(4, 0.5), { role: "PASSENGER" });
    const p3 = await makeUser(org.id, site.id, "p3@example.org", at(5.5, 0.4), { role: "PASSENGER" });
    for (const p of [p1, p2, p3]) {
      await db.match.create({ data: { orgId: org.id, siteId: site.id, driverId: d.id, passengerId: p.id, direction: "AM", score: 80, sharedDays: "1,2,3,4,5", detourMinAvg: 3, detourMinMax: 3, extraRideMinAvg: 0, details: "{}" } });
    }
    const req1 = await db.poolRequest.create({ data: { fromUserId: p1.id, toUserId: d.id, direction: "AM", days: "1,2,3,4,5" } });
    const r1 = await acceptRequest(req1.id, d.id);
    expect(r1.ok).toBe(true);
    const pool = await db.pool.findFirstOrThrow({ include: { members: { orderBy: { stopOrder: "asc" } } } });
    expect(pool.members.map((m) => m.userId)).toEqual([d.id, p1.id]);
    expect((await db.match.findFirstOrThrow({ where: { passengerId: p1.id } })).status).toBe("CONVERTED");
    expect((await db.poolRequest.findUniqueOrThrow({ where: { id: req1.id } })).status).toBe("ACCEPTED");
    expect(await db.notification.count({ where: { kind: "REQUEST_ACCEPTED" } })).toBe(2);

    // Second passenger: inserted, seats now full (2).
    const req2 = await db.poolRequest.create({ data: { fromUserId: p2.id, toUserId: d.id, direction: "AM", days: "1,3" } });
    expect((await acceptRequest(req2.id, d.id)).ok).toBe(true);
    const members = await db.poolMember.findMany({ where: { poolId: pool.id }, orderBy: { stopOrder: "asc" } });
    expect(members.map((m) => m.userId)).toEqual([d.id, p1.id, p2.id]);
    expect(JSON.parse(members[2].pickupTimes)).toHaveProperty("1");
    expect(JSON.parse(members[2].pickupTimes)).not.toHaveProperty("2");

    // Third: refused for capacity, with a reason.
    const req3 = await db.poolRequest.create({ data: { fromUserId: p3.id, toUserId: d.id, direction: "AM", days: "1" } });
    const r3 = await acceptRequest(req3.id, d.id);
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.reason).toBe("No seats free");
  });
});
