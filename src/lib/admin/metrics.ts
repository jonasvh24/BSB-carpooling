import { db } from "../db";
import { cellKey, cellSizeDeg } from "../geo/approx";
import { unmatchedReasons } from "../matching-service";
import { isoWeekKey, todayInZone, addDaysIso, isoWeekday } from "../time";
import { parseThresholds } from "./thresholds";
import type { UnmatchedReason } from "../matching/types";

export type Metrics = Awaited<ReturnType<typeof computeMetrics>>;

// Smallest group for which survey answers are shown or exported. Below it a
// bar in a chart is one colleague's answer. Used by the dashboard, the surveys
// page and the survey export.
export const MIN_GROUP = 5;
// Smallest number of homes in a heat-map cell.
export const MIN_CELL = 3;

// Every §8.2 metric. Definitions live next to the values in the UI (t.admin.metrics.*Def).
export async function computeMetrics(orgId: string, opts: { withDiagnostics?: boolean } = {}) {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: orgId } });
  const today = todayInZone(org.timezone);
  const week = isoWeekKey(today);
  // Monday..Sunday of the current ISO week.
  const monday = addDaysIso(today, 1 - isoWeekday(today));
  const sunday = addDaysIso(monday, 6);

  const users = await db.user.findMany({
    where: { orgId, status: { not: "DELETED" } },
    include: {
      profile: true,
      scheduleEntries: { select: { siteId: true } },
      surveyResponses: true,
      consents: { where: { scope: "PILOT_RESEARCH", withdrawnAt: null }, select: { id: true } },
    },
  });
  // Research answers count only while the person's research consent is open.
  for (const u of users) if (u.consents.length === 0) u.surveyResponses = [];
  const signups = users.length;
  const completed = users.filter((u) => u.onboardingCompletedAt);
  const sites = await db.site.findMany({ where: { orgId }, select: { id: true, name: true } });

  const roleSplit: Record<string, number> = { DRIVER: 0, PASSENGER: 0, EITHER: 0 };
  for (const u of completed) roleSplit[u.profile?.rideRole ?? "EITHER"]++;
  const siteSplit = sites.map((s) => ({ site: s.name, users: users.filter((u) => u.scheduleEntries.some((e) => e.siteId === s.id)).length }));

  const matches = await db.match.findMany({ where: { orgId, detourMinMax: { lte: org.matchDetourThresholdMin } }, select: { driverId: true, passengerId: true } });
  const matchableIds = new Set<string>();
  for (const m of matches) {
    matchableIds.add(m.driverId);
    matchableIds.add(m.passengerId);
  }
  const completedIds = new Set(completed.map((u) => u.id));
  const matchable = [...matchableIds].filter((id) => completedIds.has(id)).length;

  const activePoolMembers = await db.poolMember.findMany({ where: { status: "ACTIVE", pool: { orgId, status: "ACTIVE" } }, select: { userId: true, poolId: true } });
  const inActivePool = new Set(activePoolMembers.map((m) => m.userId));
  const poolConversion = matchable ? [...matchableIds].filter((id) => completedIds.has(id) && inActivePool.has(id)).length / matchable : 0;

  const pools = await db.pool.groupBy({ by: ["status"], where: { orgId }, _count: true });
  const poolCount = (s: string) => pools.find((p) => p.status === s)?._count ?? 0;
  const activePools = poolCount("ACTIVE");
  const formedEver = activePools + poolCount("PAUSED") + poolCount("ENDED");
  const avgSize = activePools ? activePoolMembers.length / activePools : 0;
  const poolSurvival = formedEver ? activePools / formedEver : 0;

  const weekTrips = await db.trip.findMany({ where: { pool: { orgId }, date: { gte: monday, lte: sunday } }, include: { participants: true } });
  const tripCount = (s: string) => weekTrips.filter((t) => t.status === s).length;
  const tripsPlanned = weekTrips.length;
  const doneWeek = weekTrips.filter((t) => t.status === "DONE");
  const noShows = doneWeek.reduce((n, t) => n + t.participants.filter((p) => p.status === "NO_SHOW").length, 0);
  const shows = doneWeek.reduce((n, t) => n + t.participants.filter((p) => p.status === "IN" || p.status === "NO_SHOW").length, 0);
  const trips = {
    week,
    planned: tripsPlanned,
    confirmed: tripCount("CONFIRMED"),
    done: doneWeek.length,
    cancelled: tripCount("CANCELLED"),
    cancellationRate: tripsPlanned ? tripCount("CANCELLED") / tripsPlanned : 0,
    noShowRate: shows ? noShows / shows : 0,
    cadence: activePools ? doneWeek.length / activePools : 0,
  };

  const doneAll = await db.trip.findMany({ where: { pool: { orgId }, status: "DONE" }, select: { kmSaved: true } });
  const kmSaved = doneAll.reduce((s, t) => s + (t.kmSaved ?? 0), 0);
  const carAlone = new Set(users.filter((u) => u.surveyResponses.some((r) => r.surveyKey === "ONBOARDING" && (JSON.parse(r.answers) as { r1?: string }).r1 === "CAR_ALONE")).map((u) => u.id));
  const parkingFreed = new Set(doneWeek.flatMap((t) => t.participants.filter((p) => p.status === "IN" && p.userId && p.userId !== t.driverId && carAlone.has(p.userId)).map((p) => p.userId!))).size;

  // Survey aggregates R1–R9 as counts, R10 as a list; week-4 recommend share.
  const onboarding = users.flatMap((u) => u.surveyResponses.filter((r) => r.surveyKey === "ONBOARDING").map((r) => JSON.parse(r.answers) as Record<string, string | number>));
  const counts = (key: string) => {
    const out: Record<string, number> = {};
    for (const a of onboarding) {
      const v = a[key];
      if (v == null || v === "") continue;
      out[String(v)] = (out[String(v)] ?? 0) + 1;
    }
    return out;
  };
  const r2Values = onboarding.map((a) => Number(a.r2)).filter((n) => Number.isFinite(n));
  // Below MIN_GROUP nothing but the count is returned.
  const suppressed = onboarding.length < MIN_GROUP;
  const agg = (key: string): Record<string, number> => (suppressed ? {} : counts(key));
  const survey = {
    n: onboarding.length,
    suppressed,
    r1: agg("r1"),
    r2: suppressed ? { median: 0, buckets: {} as Record<string, number> } : { median: median(r2Values), buckets: bucketMinutes(r2Values) },
    r3: agg("r3"),
    r4: agg("r4"),
    r5: agg("r5"),
    r6: agg("r6"),
    r7: agg("r7"),
    r8: agg("r8"),
    r9: agg("r9"),
    // Sorted so the order says nothing about who signed up when.
    r10: suppressed ? [] : onboarding.map((a) => String(a.r10 ?? "")).filter(Boolean).sort(),
  };
  const r8yes = !suppressed && survey.n ? (survey.r8.YES ?? 0) / survey.n : 0;
  const week4 = users.flatMap((u) => u.surveyResponses.filter((r) => r.surveyKey === "WEEK4").map((r) => JSON.parse(r.answers) as Record<string, string | number>));
  const recommend = week4.length >= MIN_GROUP ? week4.filter((a) => Number(a.recommend) >= 4).length / week4.length : 0;
  const exit = users.flatMap((u) => u.surveyResponses.filter((r) => r.surveyKey === "EXIT").map((r) => JSON.parse(r.answers) as Record<string, string | number>));

  const unmatched: Record<UnmatchedReason, number> = { NO_SCHEDULE: 0, NO_DRIVERS: 0, NO_CANDIDATE_IN_CORRIDOR: 0, TIME_MISMATCH: 0, CAPACITY: 0 };
  if (opts.withDiagnostics) {
    const diag = await unmatchedReasons(orgId);
    for (const [id, r] of diag) if (completedIds.has(id)) unmatched[r]++;
  }

  const thresholds = parseThresholds(org.goNoGoThresholds);
  const values = {
    signupRate: org.headcount ? signups / org.headcount : 0,
    onboarding: signups ? completed.length / signups : 0,
    matchable: completed.length ? matchable / completed.length : 0,
    poolConversion,
    poolSurvival,
    tripCadence: trips.cadence,
    cancellation: trips.cancellationRate,
    recommend,
    commercial: r8yes,
  };
  const goNoGo = (Object.keys(thresholds) as Array<keyof typeof thresholds>).map((k) => {
    const lowerIsBetter = k === "cancellation";
    const ok = lowerIsBetter ? values[k] <= thresholds[k] : values[k] >= thresholds[k];
    return { key: k, value: values[k], threshold: thresholds[k], ok, lowerIsBetter };
  });

  return {
    org: { name: org.name, headcount: org.headcount, kmRateCents: org.kmRateCents, co2GramsPerKm: org.co2GramsPerKm, threshold: org.matchDetourThresholdMin },
    signups,
    completed: completed.length,
    roleSplit,
    siteSplit,
    matchable,
    unmatched,
    pools: { active: activePools, paused: poolCount("PAUSED"), ended: poolCount("ENDED"), forming: poolCount("FORMING"), avgSize },
    trips,
    impact: {
      kmSaved: Math.round(kmSaved * 10) / 10,
      co2Kg: Math.round((kmSaved * org.co2GramsPerKm) / 100) / 10,
      moneyEur: Math.round(kmSaved * org.kmRateCents) / 100,
      parkingFreed,
    },
    survey,
    week4: { n: week4.length, recommend },
    exit: exit.length >= MIN_GROUP ? { n: exit.length, keep: exit.filter((a) => a.keep === "YES").length, pay: exit.filter((a) => a.pay === "YES").length } : { n: exit.length, keep: 0, pay: 0 },
    goNoGo,
    values,
  };
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function bucketMinutes(xs: number[]): Record<string, number> {
  const out: Record<string, number> = { "0-15": 0, "15-30": 0, "30-45": 0, "45-60": 0, "60+": 0 };
  for (const x of xs) out[x < 15 ? "0-15" : x < 30 ? "15-30" : x < 45 ? "30-45" : x < 60 ? "45-60" : "60+"]++;
  return out;
}

export type HeatCell = { lat: number; lng: number; dLat: number; dLng: number; count: number; coarse: boolean };

// §8.2 heat map: 1 km cells with at least MIN_CELL homes; the rest are pooled into
// 3 km cells, shown only if they reach MIN_CELL too. The brief said two; with two,
// an administrator who lives in a cell learns where the one other person lives.
export async function heatCells(orgId: string): Promise<HeatCell[]> {
  const homes = await db.user.findMany({ where: { orgId, status: "ACTIVE", homeLat: { not: null }, homeLng: { not: null } }, select: { homeLat: true, homeLng: true } });
  const fine = new Map<string, { lat: number; lng: number; n: number }>();
  for (const h of homes) {
    const p = { lat: h.homeLat!, lng: h.homeLng! };
    const k = cellKey(p, 1000);
    const cur = fine.get(k) ?? { ...p, n: 0 };
    cur.n++;
    fine.set(k, cur);
  }
  const cells: HeatCell[] = [];
  const singles: Array<{ lat: number; lng: number }> = [];
  for (const c of fine.values()) {
    if (c.n >= MIN_CELL) {
      const { dLat, dLng } = cellSizeDeg(c.lat, 1000);
      cells.push({ lat: Math.floor(c.lat / dLat) * dLat, lng: Math.floor(c.lng / dLng) * dLng, dLat, dLng, count: c.n, coarse: false });
    } else for (let i = 0; i < c.n; i++) singles.push(c);
  }
  const coarse = new Map<string, { lat: number; lng: number; n: number }>();
  for (const s of singles) {
    const k = cellKey(s, 3000);
    const cur = coarse.get(k) ?? { ...s, n: 0 };
    cur.n++;
    coarse.set(k, cur);
  }
  for (const c of coarse.values()) {
    if (c.n < MIN_CELL) continue;
    const { dLat, dLng } = cellSizeDeg(c.lat, 3000);
    cells.push({ lat: Math.floor(c.lat / dLat) * dLat, lng: Math.floor(c.lng / dLng) * dLng, dLat, dLng, count: c.n, coarse: true });
  }
  return cells;
}
