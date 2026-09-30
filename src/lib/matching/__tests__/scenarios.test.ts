import { describe, expect, it } from "vitest";
import { computeMatches } from "../engine";
import { insertStop, planRoute, poolTimesForDay } from "../insert";
import { findLift } from "../lift";
import { combine, prefScore } from "../score";
import { withFallback } from "../../geo/with-fallback";
import { at, ctx, driver, passenger, schedule, site, stubRouter, throwingRouter, user } from "./fixtures";

// Geometry shared by most scenarios: driver 10 km north of the site, passenger
// 5 km north and 2.2 km east. Detour ≈ 0.93 km ≈ 1.85 min + 2 min dwell ≈ 4 min.
const D = at(10);
const P = at(5, 2.2);

describe("§11.2 engine scenarios", () => {
  it("1. same corridor, ~4 min detour, same times → matched, score > 70", async () => {
    const out = await computeMatches(ctx([driver("d", D), passenger("p", P)]), ["AM"]);
    expect(out.matches).toHaveLength(1);
    const m = out.matches[0];
    expect(m.driverId).toBe("d");
    expect(m.passengerId).toBe("p");
    expect(m.detourMinAvg).toBeGreaterThan(3.5);
    expect(m.detourMinAvg).toBeLessThan(4.5);
    expect(m.score).toBeGreaterThan(70);
    expect(m.sharedDays).toEqual([1, 2, 3, 4, 5]);
    expect(m.details.reasons.length).toBeGreaterThanOrEqual(2);
    expect(m.details.reasons.map((r) => r.code)).toContain("detour");
    expect(m.details.reasons.map((r) => r.code)).toContain("pickupDoor");
  });

  it("2. passenger on the opposite side of the site → not matched (corridor)", async () => {
    const out = await computeMatches(ctx([driver("d", D), passenger("p", at(-5))]), ["AM"]);
    expect(out.matches).toHaveLength(0);
    expect(out.diagnostics.get("p")).toBe("NO_CANDIDATE_IN_CORRIDOR");
    expect(out.routeCalls).toBe(1); // only the driver's direct route was asked for
  });

  it("3. passenger must arrive by 07:30, driver cannot be there before 08:00 → not matched (time)", async () => {
    const p = passenger("p", P, {}, schedule([1, 2, 3, 4, 5], { arriveBy: "07:30", arriveFlexMin: 0 }));
    const out = await computeMatches(ctx([driver("d", D), p]), ["AM"]);
    expect(out.matches).toHaveLength(0);
    expect(out.diagnostics.get("p")).toBe("TIME_MISMATCH");
    expect(out.diagnostics.get("d")).toBe("TIME_MISMATCH");
  });

  it("4. driver has 0 seats free after existing members → not matched (capacity)", async () => {
    const full = driver("d", D, { seatsAvailable: 1 }, undefined, {
      seatsUsed: { AM: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 } },
    });
    const out = await computeMatches(ctx([full, passenger("p", P)]), ["AM"]);
    expect(out.matches).toHaveLength(0);
    expect(out.diagnostics.get("p")).toBe("CAPACITY");
  });

  it("5. part-time passenger (Mon, Wed) and full-time driver → sharedDays 1,3 and daysScore 0.4", async () => {
    const p = passenger("p", P, {}, schedule([1, 3]));
    const out = await computeMatches(ctx([driver("d", D), p]), ["AM"]);
    expect(out.matches).toHaveLength(1);
    const m = out.matches[0];
    expect(m.sharedDays).toEqual([1, 3]);
    const detour = 1 - m.detourMinAvg / 10;
    expect(m.score).toBe(combine({ detour, time: 1, days: 0.4, pref: 1, reliability: 0.7 }));
  });

  it("6. smoking conflict excludes; QUIET vs CHATTY halves prefScore but still matches", async () => {
    const smoker = driver("d", D, { smoking: "YES" });
    const out1 = await computeMatches(ctx([smoker, passenger("p", P, { smoking: "NO" })]), ["AM"]);
    expect(out1.matches).toHaveLength(0);

    const quiet = driver("d", D, { talk: "QUIET" });
    const chatty = passenger("p", P, { talk: "CHATTY" });
    expect(prefScore(quiet.profile, chatty.profile)).toBe(0.5);
    const out2 = await computeMatches(ctx([quiet, chatty]), ["AM"]);
    expect(out2.matches).toHaveLength(1);
    const m = out2.matches[0];
    const detour = 1 - m.detourMinAvg / 10;
    expect(m.score).toBe(combine({ detour, time: 1, days: 1, pref: 0.5, reliability: 0.7 }));
  });

  it("7. two EITHER users → both orientations computed, higher kept, rotation reason present", async () => {
    // A 10 km north, B 8 km north + 1 km east. A driving costs ~2.6 min; B driving ~10 min.
    const a = user("a", at(10), { maxDetourMin: 15 });
    const b = user("b", at(8, 1), { maxDetourMin: 15 });
    const out = await computeMatches(ctx([a, b]), ["AM"]);
    expect(out.matches).toHaveLength(1);
    const m = out.matches[0];
    expect(m.driverId).toBe("a");
    expect(m.passengerId).toBe("b");
    expect(m.details.rotation).toBe(true);
    expect(m.details.reasons.map((r) => r.code)).toContain("rotation");
  });

  it("8. multi-stop insertion picks the cheapest position, respects the detour cap, refuses a fourth", async () => {
    const d = { id: "d", home: at(10), maxDetourMin: 10, seatsAvailable: 4 };
    const p1 = { userId: "p1", location: at(7, 0.5), maxExtraRideMin: 15 };
    const p2 = { userId: "p2", location: at(4, 0.5), maxExtraRideMin: 15 };
    const p3 = { userId: "p3", location: at(5.5, 0.4), maxExtraRideMin: 15 };
    const base = await planRoute(d, [p1, p2], site.location, "AM", stubRouter);
    expect(base.ok).toBe(true);

    const withP3 = await insertStop(d, [p1, p2], p3, site.location, "AM", stubRouter);
    expect(withP3.ok).toBe(true);
    if (!withP3.ok) return;
    expect(withP3.plan.order.map((s) => s.userId)).toEqual(["p1", "p3", "p2"]);
    expect(withP3.plan.detourMin).toBeLessThanOrEqual(10);
    expect(withP3.plan.detourMin).toBeGreaterThan(base.ok ? base.plan.detourMin : 0);

    const p4 = { userId: "p4", location: at(3, 4), maxExtraRideMin: 45 };
    const withP4 = await insertStop(d, withP3.plan.order, p4, site.location, "AM", stubRouter);
    expect(withP4.ok).toBe(false);
    if (!withP4.ok) expect(withP4.reason).toBe("detour");

    // Capacity is checked before any routing.
    const small = { ...d, seatsAvailable: 2 };
    const full = await insertStop(small, [p1, p2], p3, site.location, "AM", stubRouter);
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.reason).toBe("capacity");
  });

  it("9. PM matching is independent of AM: same pair matched AM, not PM", async () => {
    const p = passenger("p", P, {}, schedule([1, 2, 3, 4, 5], { departEarliest: "15:00", departFlexMin: 0 }));
    const out = await computeMatches(ctx([driver("d", D), p]));
    expect(out.matches.map((m) => m.direction)).toEqual(["AM"]);
  });

  it("10. routing provider throws → fallback heuristic, match still produced, estimated = true", async () => {
    const errors: unknown[] = [];
    const router = withFallback(throwingRouter, (e) => errors.push(e));
    const out = await computeMatches(ctx([driver("d", D), passenger("p", P)], router), ["AM"]);
    expect(errors.length).toBeGreaterThan(0);
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0].details.estimated).toBe(true);
    expect(out.matches[0].details.reasons.map((r) => r.code)).toContain("estimated");
  });

  it("11. pickup arithmetic for a two-stop AM route matches hand computation", async () => {
    // Along the meridian at 30 km/h: D→P1 3 km = 6 min, P1→P2 3 km = 6 min, P2→S 4 km = 8 min.
    const d = { id: "d", home: at(10), maxDetourMin: 15, seatsAvailable: 3 };
    const p1 = { userId: "p1", location: at(7), maxExtraRideMin: 15 };
    const p2 = { userId: "p2", location: at(4), maxExtraRideMin: 15 };
    const plan = await planRoute(d, [p1, p2], site.location, "AM", stubRouter);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.plan.legsMin.map((m) => Math.round(m))).toEqual([6, 6, 8]);
    // Everyone: arrive by 08:15, flex 15 → window [08:00, 08:15], target 08:10.
    const s = schedule([1])[1]!;
    const times = poolTimesForDay(plan.plan, "AM", [s, s, s]);
    expect(times).toEqual({
      driverLeaves: "07:46", // 08:10 − 20 min driving − 2 × 2 min dwell
      siteTime: "08:10",
      stops: [
        { userId: "p1", time: "07:52" },
        { userId: "p2", time: "08:00" }, // 07:52 + 2 dwell + 6
      ],
    });
  });

  it("12. findLift returns only drivers with a free seat on that date and ignores day overlap", async () => {
    const p = passenger("p", P);
    const noSeat = driver("full", D);
    const wedOnly = driver("wed", at(9, 0.5), {}, schedule([3]));
    const lifts = await findLift(
      p,
      3,
      "AM",
      [
        { user: noSeat, seatsFreeToday: 0, poolId: "pool-full" },
        { user: wedOnly, seatsFreeToday: 1, poolId: "pool-wed" },
      ],
      site,
      stubRouter,
      new Set(),
    );
    expect(lifts.map((l) => l.driverId)).toEqual(["wed"]);
    expect(lifts[0].poolId).toBe("pool-wed");
    // Days score ignored: the score is what a full-overlap pair would get.
    const detour = 1 - lifts[0].detourMinAvg / 10;
    expect(lifts[0].score).toBe(combine({ detour, time: 1, days: 1, pref: 1, reliability: 0.7 }));
  });
});

describe("engine extras", () => {
  it("never matches a user with themselves and respects blocks and converted pairs", async () => {
    const both = [driver("d", D), passenger("p", P)];
    const blocked = { ...ctx(both), blockedPairs: new Set(["d|p"]) };
    expect((await computeMatches(blocked, ["AM"])).matches).toHaveLength(0);
    const converted = { ...ctx(both), convertedPairs: new Set(["d|p|AM"]) };
    expect((await computeMatches(converted, ["AM"])).matches).toHaveLength(0);
    const alone = ctx([user("x", D)]);
    expect((await computeMatches(alone, ["AM"])).matches).toHaveLength(0);
  });

  it("per-user recompute only evaluates pairs involving that user", async () => {
    const users = [driver("d1", D), driver("d2", at(9)), passenger("p1", P), passenger("p2", at(6, 1))];
    const all = await computeMatches(ctx(users), ["AM"]);
    const only = await computeMatches({ ...ctx(users), onlyUserIds: new Set(["p2"]) }, ["AM"]);
    expect(all.matches.length).toBe(4);
    expect(only.matches.every((m) => m.passengerId === "p2")).toBe(true);
    expect(only.matches.length).toBe(2);
  });

  it("same-gender preference needs both genders known and equal", async () => {
    const d = driver("d", D, { genderPref: "SAME" }, undefined, { gender: "FEMALE" });
    expect((await computeMatches(ctx([d, passenger("p", P)]), ["AM"])).matches).toHaveLength(0);
    const p = passenger("p", P, {}, undefined, { gender: "FEMALE" });
    expect((await computeMatches(ctx([d, p]), ["AM"])).matches).toHaveLength(1);
  });
});
