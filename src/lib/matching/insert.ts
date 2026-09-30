import type { LatLng } from "../geo/haversine";
import { minToHm } from "../time";
import { intersect, siteTime as siteTimeOf, windowFor } from "./windows";
import { DWELL_MIN, type Direction, type EngineSchedule, type Router, type Weekday } from "./types";

export type PoolStop = { userId: string; location: LatLng; maxExtraRideMin: number };

export type PoolDriver = { id: string; home: LatLng; maxDetourMin: number; seatsAvailable: number };

export type RoutePlan = {
  order: PoolStop[]; // pickup order (AM) or drop-off order (PM)
  legsMin: number[]; // leg durations in minutes, in travel order
  totalMin: number; // travel only, excluding dwell
  directMin: number;
  detourMin: number; // including dwell per stop
  extraRideMin: Record<string, number>;
  distanceM: number;
  estimated: boolean;
  points: LatLng[];
};

export type InsertResult =
  | { ok: true; plan: RoutePlan }
  | { ok: false; reason: "capacity" | "detour" | "extraRide"; userId?: string; detail?: string };

function travelPoints(driver: PoolDriver, order: PoolStop[], site: LatLng, direction: Direction): LatLng[] {
  const stops = order.map((s) => s.location);
  return direction === "AM" ? [driver.home, ...stops, site] : [site, ...stops, driver.home];
}

// Routes one specific stop order and checks every cap (§6.7).
export async function planRoute(
  driver: PoolDriver,
  order: PoolStop[],
  site: LatLng,
  direction: Direction,
  router: Router,
  opts: { enforceCaps?: boolean } = {},
): Promise<InsertResult> {
  // Caps are enforced when adding a member; an existing pool is always planned
  // (e.g. for a rotation driver whose own caps differ from the founder's).
  const enforce = opts.enforceCaps ?? true;
  if (enforce && order.length > driver.seatsAvailable) return { ok: false, reason: "capacity" };
  const points = travelPoints(driver, order, site, direction);
  const [route, direct] = await Promise.all([
    router(points),
    router(direction === "AM" ? [driver.home, site] : [site, driver.home]),
  ]);
  const legsMin = route.legs.map((l) => l.durationS / 60);
  const totalMin = legsMin.reduce((a, b) => a + b, 0);
  const directMin = direct.durationS / 60;
  const detourMin = totalMin - directMin + DWELL_MIN * order.length;
  if (enforce && detourMin > driver.maxDetourMin) {
    return { ok: false, reason: "detour", detail: `${Math.round(detourMin)} > ${driver.maxDetourMin}` };
  }

  // Each passenger's pooled time versus going straight from their home.
  const extraRideMin: Record<string, number> = {};
  for (let i = 0; i < order.length; i++) {
    const stop = order[i];
    let pooled: number;
    if (direction === "AM") {
      // From pickup i: legs i+1..end plus a dwell for every later pickup.
      pooled = legsMin.slice(i + 1).reduce((a, b) => a + b, 0) + DWELL_MIN * (order.length - 1 - i);
    } else {
      // From leaving the site to drop-off i: legs 0..i plus a dwell for every earlier drop-off.
      pooled = legsMin.slice(0, i + 1).reduce((a, b) => a + b, 0) + DWELL_MIN * i;
    }
    const own = await router(direction === "AM" ? [stop.location, site] : [site, stop.location]);
    const extra = Math.max(0, pooled - own.durationS / 60);
    extraRideMin[stop.userId] = Math.round(extra * 10) / 10;
    if (enforce && extra > stop.maxExtraRideMin) {
      return { ok: false, reason: "extraRide", userId: stop.userId, detail: `${Math.round(extra)} > ${stop.maxExtraRideMin}` };
    }
  }

  return {
    ok: true,
    plan: {
      order,
      legsMin,
      totalMin,
      directMin,
      detourMin: Math.round(detourMin * 10) / 10,
      extraRideMin,
      distanceM: route.distanceM,
      estimated: route.estimated || direct.estimated,
      points,
    },
  };
}

// Try the new stop at every position; keep the cheapest feasible plan by added duration.
export async function insertStop(
  driver: PoolDriver,
  existing: PoolStop[],
  newStop: PoolStop,
  site: LatLng,
  direction: Direction,
  router: Router,
): Promise<InsertResult> {
  if (existing.length + 1 > driver.seatsAvailable) return { ok: false, reason: "capacity" };
  let best: InsertResult | null = null;
  let firstFailure: InsertResult | null = null;
  for (let pos = 0; pos <= existing.length; pos++) {
    const order = [...existing.slice(0, pos), newStop, ...existing.slice(pos)];
    const r = await planRoute(driver, order, site, direction, router);
    if (r.ok) {
      if (!best || !best.ok || r.plan.totalMin < best.plan.totalMin) best = r;
    } else if (!firstFailure) firstFailure = r;
  }
  return best ?? firstFailure ?? { ok: false, reason: "detour" };
}

export type StopTimes = { userId: string; time: string }[];
export type PoolDayTimes = { driverLeaves: string; siteTime: string; stops: StopTimes; driverHome?: string };

// Pickup (AM) or drop-off (PM) times for one weekday from the routed plan and
// every member's window (§6.4, generalised to n stops).
export function poolTimesForDay(
  plan: RoutePlan,
  direction: Direction,
  schedules: EngineSchedule[],
): PoolDayTimes | null {
  const common = intersect(schedules.map((s) => windowFor(s, direction)));
  if (!common) return null;
  const site = siteTimeOf(common, direction);
  const n = plan.order.length;
  const stops: StopTimes = [];
  if (direction === "AM") {
    const leave = site - plan.totalMin - DWELL_MIN * n;
    let t = leave;
    for (let i = 0; i < n; i++) {
      t += plan.legsMin[i];
      stops.push({ userId: plan.order[i].userId, time: minToHm(t) });
      t += DWELL_MIN;
    }
    return { driverLeaves: minToHm(leave), siteTime: minToHm(site), stops };
  }
  let t = site;
  for (let i = 0; i < n; i++) {
    t += plan.legsMin[i];
    stops.push({ userId: plan.order[i].userId, time: minToHm(t) });
    t += DWELL_MIN;
  }
  t += plan.legsMin[n];
  return { driverLeaves: minToHm(site), siteTime: minToHm(site), stops, driverHome: minToHm(t) };
}

export type WeekdayPlan = Partial<Record<Weekday, PoolDayTimes>>;
