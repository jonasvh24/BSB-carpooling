import { haversineKm, type LatLng } from "../geo/haversine";
import { minToHm } from "../time";
import { intersect, referenceMin, siteTime as siteTimeOf, windowFor } from "./windows";
import { combine, daysScore, detourScore, prefScore, reliabilityOf, reliabilityScore, timeScore } from "./score";
import { memoRouter, mapLimit } from "./routing";
import {
  CORRIDOR_KM_PER_DETOUR_MIN,
  CORRIDOR_MAX_CANDIDATES,
  DWELL_MIN,
  MIN_DISPLAY_SCORE,
  RELIABILITY_MIN_TRIPS,
  type DayDetail,
  type Direction,
  type EngineContext,
  type EngineOutput,
  type EngineUser,
  type MatchCandidate,
  type Reason,
  type RouteResult,
  type Router,
  type UnmatchedReason,
  type Weekday,
} from "./types";

const ALL_WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];

// Stage reached by a user's best candidate; higher = closer to a match.
// NO_DRIVERS: no counterpart at all. NO_CANDIDATE_IN_CORRIDOR: counterparts
// exist but none survived the corridor prefilter or the routed detour cap.
const STAGE: Record<UnmatchedReason, number> = {
  NO_SCHEDULE: 0,
  NO_DRIVERS: 1,
  NO_CANDIDATE_IN_CORRIDOR: 2,
  TIME_MISMATCH: 3,
  CAPACITY: 4,
};

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function wantsDirection(u: EngineUser, direction: Direction): boolean {
  return u.profile.directions === "BOTH" || u.profile.directions === direction;
}

// Weekdays on which the user is at this site and shares this direction.
export function activeDays(u: EngineUser, siteId: string, direction: Direction): Weekday[] {
  if (!wantsDirection(u, direction)) return [];
  return ALL_WEEKDAYS.filter((wd) => {
    const s = u.schedule[wd];
    return s && s.siteId === siteId && (direction === "AM" ? s.wantsAm : s.wantsPm);
  });
}

export function isDriverCandidate(u: EngineUser): boolean {
  return (u.profile.rideRole === "DRIVER" || u.profile.rideRole === "EITHER") && u.profile.seatsAvailable >= 1;
}

export function isPassengerCandidate(u: EngineUser): boolean {
  return u.profile.rideRole === "PASSENGER" || u.profile.rideRole === "EITHER";
}

// Hard filters 2 and 3 (§6.3): smoking and same-gender preference.
export function preferencesCompatible(a: EngineUser, b: EngineUser): boolean {
  const sa = a.profile.smoking;
  const sb = b.profile.smoking;
  if ((sa === "NO" && sb === "YES") || (sa === "YES" && sb === "NO")) return false;
  if (a.profile.genderPref === "SAME" || b.profile.genderPref === "SAME") {
    if (!a.gender || !b.gender || a.gender !== b.gender) return false;
  }
  return true;
}

// Hard filter 4: straight-line corridor value in km.
export function corridorKm(driver: LatLng, passenger: LatLng, site: LatLng): number {
  return haversineKm(driver, passenger) + haversineKm(passenger, site) - haversineKm(driver, site);
}

function seatsFree(driver: EngineUser, direction: Direction, wd: Weekday): number {
  return driver.profile.seatsAvailable - (driver.seatsUsed[direction]?.[wd] ?? 0);
}

export type PairEvaluation =
  | { ok: true; candidate: MatchCandidate }
  | { ok: false; stage: UnmatchedReason };

// Evaluates one driver/passenger pair for one direction over the given weekdays.
// Used by the full run, per-user recompute and findLift.
export async function evaluatePair(
  driver: EngineUser,
  passenger: EngineUser,
  direction: Direction,
  weekdays: Weekday[],
  site: { id: string; location: LatLng },
  router: Router,
  opts: { ignoreDays?: boolean; directRoute?: RouteResult } = {},
): Promise<PairEvaluation> {
  const S = site.location;
  const D = driver.home;
  const P = passenger.home;

  const directPts = direction === "AM" ? [D, S] : [S, D];
  const pooledPts = direction === "AM" ? [D, P, S] : [S, P, D];
  const direct = opts.directRoute ?? (await router(directPts));
  const pooled = await router(pooledPts);
  const estimated = direct.estimated || pooled.estimated;

  // Hard filter 5: routed detour including the pickup dwell. Rounded to 0.1 min
  // before scoring so the stored value and the score always agree.
  const detourMin = round1((pooled.durationS - direct.durationS) / 60 + DWELL_MIN);
  if (detourMin > driver.profile.maxDetourMin) return { ok: false, stage: "NO_CANDIDATE_IN_CORRIDOR" };

  const leg0 = pooled.legs[0].durationS / 60;
  const leg1 = pooled.legs[1].durationS / 60;
  const days: Partial<Record<Weekday, DayDetail>> = {};
  let stage: UnmatchedReason = "TIME_MISMATCH";

  const dDays = activeDays(driver, site.id, direction).length;
  const pDays = activeDays(passenger, site.id, direction).length;
  const dScore = opts.ignoreDays ? 1 : daysScore(weekdays.length, dDays, pDays);
  const pScore = prefScore(driver.profile, passenger.profile);
  const rScore = reliabilityScore(driver, passenger);
  const detScore = detourScore(detourMin, driver.profile.maxDetourMin);

  for (const wd of weekdays) {
    const sd = driver.schedule[wd];
    const sp = passenger.schedule[wd];
    if (!sd || !sp) continue;
    const common = intersect([windowFor(sd, direction), windowFor(sp, direction)]);
    if (!common) continue;
    // Hard filter 8: capacity on that weekday.
    if (seatsFree(driver, direction, wd) < 1) {
      stage = "CAPACITY";
      continue;
    }
    const site = siteTimeOf(common, direction);
    let pickup: number;
    let driverLeaves: number;
    if (direction === "AM") {
      driverLeaves = site - (leg0 + leg1) - DWELL_MIN;
      pickup = driverLeaves + leg0;
    } else {
      driverLeaves = site;
      pickup = site + leg0; // drop-off at the passenger's home
    }
    const tScore = timeScore(referenceMin(sd, direction), referenceMin(sp, direction));
    days[wd] = {
      pickupTime: minToHm(pickup),
      siteTime: minToHm(site),
      driverLeaves: minToHm(driverLeaves),
      detourMin: round1(detourMin),
      extraRideMin: 0, // a two-person pool rides the passenger's direct leg
      score: combine({ detour: detScore, time: tScore, days: dScore, pref: pScore, reliability: rScore }),
    };
  }

  const feasible = Object.keys(days).map(Number) as Weekday[];
  if (feasible.length === 0) return { ok: false, stage };

  // Per-weekday scores are averaged over the shared feasible days (§6.5).
  const score = Math.round(feasible.reduce((s, wd) => s + days[wd]!.score, 0) / feasible.length);
  const candidate: MatchCandidate = {
    siteId: site.id,
    driverId: driver.id,
    passengerId: passenger.id,
    direction,
    score,
    sharedDays: feasible,
    detourMinAvg: round1(detourMin),
    detourMinMax: round1(detourMin),
    extraRideMinAvg: 0,
    details: { days, reasons: [], estimated, rotation: false },
  };
  candidate.details.reasons = buildReasons(candidate, driver, passenger, direction, dDays, pDays);
  return { ok: true, candidate };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

const SHORT_DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// §6.6: short, concrete, generated from the data. Stored as codes so the UI can localise.
export function buildReasons(
  c: MatchCandidate,
  driver: EngineUser,
  passenger: EngineUser,
  direction: Direction,
  dDays: number,
  pDays: number,
): Reason[] {
  const reasons: Reason[] = [];
  const detour = Math.round(c.detourMinAvg);
  reasons.push(detour < 1 ? { code: "detourNone" } : { code: "detour", params: { min: detour } });

  // Group shared days by site time and describe the largest group.
  const groups = new Map<string, Weekday[]>();
  for (const wd of c.sharedDays) {
    const t = c.details.days[wd]!.siteTime;
    groups.set(t, [...(groups.get(t) ?? []), wd]);
  }
  const [time, days] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const dayList = days.map((d) => SHORT_DAYS[d]).join(", ");
  reasons.push({ code: direction === "AM" ? "bothAtSchool" : "bothLeave", params: { time, days: dayList } });

  const first = c.details.days[c.sharedDays[0]]!;
  if (direction === "AM") {
    reasons.push({
      code: driver.profile.pickupStyle === "MEETING_POINT" ? "pickupMeeting" : "pickupDoor",
      params: { time: first.pickupTime },
    });
  } else {
    reasons.push({ code: "dropOff", params: { time: first.pickupTime } });
  }

  if (driver.profile.talk === "QUIET" && passenger.profile.talk === "QUIET") reasons.push({ code: "quiet" });
  if (driver.profile.talk === "CHATTY" && passenger.profile.talk === "CHATTY") reasons.push({ code: "chatty" });

  const shared = driver.profile.languages.filter((l) => l !== "other" && passenger.profile.languages.includes(l));
  if (shared.length && (driver.profile.languages.length > 1 || passenger.profile.languages.length > 1)) {
    reasons.push({ code: "language", params: { lang: shared[0] } });
  }

  if (c.sharedDays.length === Math.max(dDays, pDays) && c.sharedDays.length > 1) reasons.push({ code: "everyDay" });

  const weakest = [driver, passenger].sort((a, b) => reliabilityOf(a) - reliabilityOf(b))[0];
  if (weakest.plannedTrips >= RELIABILITY_MIN_TRIPS) {
    reasons.push({
      code: "reliable",
      params: { pct: Math.round(reliabilityOf(weakest) * 100), n: weakest.plannedTrips },
    });
  } else {
    reasons.push({ code: "noHistory" });
  }
  if (c.details.estimated) reasons.push({ code: "estimated" });
  return reasons;
}

// Full run for one site (§6.1): per direction, drivers × corridor-filtered passengers.
export async function computeMatches(ctx: EngineContext, directions: Direction[] = ["AM", "PM"]): Promise<EngineOutput> {
  const router = memoRouter(ctx.router);
  const diagnostics = new Map<string, UnmatchedReason>();
  const bump = (id: string, r: UnmatchedReason) => {
    const cur = diagnostics.get(id);
    if (!cur || STAGE[r] > STAGE[cur]) diagnostics.set(id, r);
  };
  const involved = (a: string, b: string) => !ctx.onlyUserIds || ctx.onlyUserIds.has(a) || ctx.onlyUserIds.has(b);

  const byPair = new Map<string, MatchCandidate>();
  const S = ctx.site.location;

  for (const direction of directions) {
    const eligible = ctx.users.filter((u) => activeDays(u, ctx.site.id, direction).length > 0);
    for (const u of ctx.users) if (!eligible.includes(u)) bump(u.id, "NO_SCHEDULE");
    const drivers = eligible.filter(isDriverCandidate);
    const passengers = eligible.filter(isPassengerCandidate);
    for (const p of passengers) if (!drivers.some((d) => d.id !== p.id)) bump(p.id, "NO_DRIVERS");
    for (const d of drivers) if (!passengers.some((p) => p.id !== d.id)) bump(d.id, "NO_DRIVERS");

    // Direct routes, one per driver, are the baseline for every detour.
    const directRoutes = new Map<string, RouteResult>();
    await mapLimit(drivers, 4, async (d) => {
      directRoutes.set(d.id, await router(direction === "AM" ? [d.home, S] : [S, d.home]));
    });

    const work: Array<{ driver: EngineUser; passenger: EngineUser; weekdays: Weekday[] }> = [];
    for (const driver of drivers) {
      const dDays = activeDays(driver, ctx.site.id, direction);
      const scored: Array<{ p: EngineUser; km: number; weekdays: Weekday[] }> = [];
      for (const p of passengers) {
        if (p.id === driver.id || !involved(driver.id, p.id)) continue;
        if (ctx.blockedPairs.has(pairKey(driver.id, p.id))) continue;
        if (ctx.convertedPairs.has(`${driver.id}|${p.id}|${direction}`)) continue;
        // Hard filter 1: at least one shared weekday.
        const pDays = activeDays(p, ctx.site.id, direction);
        const weekdays = dDays.filter((wd) => pDays.includes(wd));
        if (weekdays.length === 0) continue;
        if (!preferencesCompatible(driver, p)) continue;
        bump(driver.id, "NO_CANDIDATE_IN_CORRIDOR");
        bump(p.id, "NO_CANDIDATE_IN_CORRIDOR");
        const km = corridorKm(driver.home, p.home, S);
        if (km > driver.profile.maxDetourMin * CORRIDOR_KM_PER_DETOUR_MIN) continue;
        scored.push({ p, km, weekdays });
      }
      scored.sort((a, b) => a.km - b.km);
      for (const s of scored.slice(0, CORRIDOR_MAX_CANDIDATES)) {
        work.push({ driver, passenger: s.p, weekdays: s.weekdays });
      }
    }

    await mapLimit(work, 4, async ({ driver, passenger, weekdays }) => {
      const result = await evaluatePair(driver, passenger, direction, weekdays, ctx.site, router, {
        directRoute: directRoutes.get(driver.id),
      });
      if (!result.ok) {
        bump(driver.id, result.stage);
        bump(passenger.id, result.stage);
        return;
      }
      byPair.set(`${driver.id}|${passenger.id}|${direction}`, result.candidate);
    });
  }

  // Two EITHER users: keep the better orientation and note that they could rotate.
  const matches: MatchCandidate[] = [];
  const consumed = new Set<string>();
  for (const [key, c] of byPair) {
    if (consumed.has(key)) continue;
    const reverseKey = `${c.passengerId}|${c.driverId}|${c.direction}`;
    const reverse = byPair.get(reverseKey);
    let keep = c;
    if (reverse) {
      consumed.add(reverseKey);
      keep = reverse.score > c.score ? reverse : c;
      keep.details.rotation = true;
      keep.details.reasons.splice(1, 0, { code: "rotation" });
    }
    consumed.add(key);
    if (keep.score >= MIN_DISPLAY_SCORE) matches.push(keep);
    else {
      bump(keep.driverId, "TIME_MISMATCH");
      bump(keep.passengerId, "TIME_MISMATCH");
    }
  }

  for (const m of matches) {
    diagnostics.delete(m.driverId);
    diagnostics.delete(m.passengerId);
  }
  matches.sort((a, b) => b.score - a.score);
  return { matches, diagnostics, routeCalls: router.calls() };
}
