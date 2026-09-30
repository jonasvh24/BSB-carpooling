import { db } from "../db";
import { route, routeGeometry } from "../geo/provider";
import { parseDays } from "../enums";
import { planRoute, poolTimesForDay, type PoolDayTimes, type PoolStop, type RoutePlan } from "../matching/insert";
import type { Direction, EngineSchedule, Weekday } from "../matching/types";
import { isoWeekKey } from "../time";
import { getISOWeek, getISOWeekYear, parseISO } from "date-fns";

export type PoolWithMembers = NonNullable<Awaited<ReturnType<typeof loadPool>>>;

export async function loadPool(poolId: string) {
  return db.pool.findUnique({
    where: { id: poolId },
    include: {
      site: true,
      members: {
        where: { status: "ACTIVE" },
        orderBy: { stopOrder: "asc" },
        include: { user: { include: { profile: true, scheduleEntries: true } } },
      },
    },
  });
}

type Member = PoolWithMembers["members"][number];

export function memberStop(m: Member): PoolStop {
  return {
    userId: m.userId,
    location: { lat: m.pickupLat ?? m.user.homeLat!, lng: m.pickupLng ?? m.user.homeLng! },
    maxExtraRideMin: m.user.profile?.maxExtraRideMin ?? 15,
  };
}

// §7.3: with rotation on, the driver for an ISO week is chosen round-robin among
// members with seats, ordered by join date. Otherwise the DRIVER member.
export function driverForWeek(pool: PoolWithMembers, date: string): Member | null {
  const drivers = pool.members.filter((m) => m.memberRole === "DRIVER");
  if (!pool.rotateDrivers) return drivers[0] ?? null;
  const eligible = pool.members
    .filter((m) => (m.user.profile?.seatsAvailable ?? 0) >= 1 && m.user.profile?.rideRole !== "PASSENGER")
    .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  if (eligible.length < 2) return drivers[0] ?? null;
  const d = parseISO(date);
  const index = (getISOWeekYear(d) * 53 + getISOWeek(d)) % eligible.length;
  return eligible[index];
}

export function scheduleFor(m: Member, weekday: number, override?: { arriveBy?: string | null; departEarliest?: string | null }): EngineSchedule | null {
  const s = m.user.scheduleEntries.find((e) => e.weekday === weekday && e.active);
  if (!s) return null;
  return {
    siteId: s.siteId,
    arriveBy: override?.arriveBy ?? s.arriveBy,
    arriveFlexMin: s.arriveFlexMin,
    departEarliest: override?.departEarliest ?? s.departEarliest,
    departFlexMin: s.departFlexMin,
    wantsAm: s.wantsAm,
    wantsPm: s.wantsPm,
  };
}

export type DayPlan = {
  weekday: Weekday;
  driverId: string;
  plan: RoutePlan;
  times: PoolDayTimes | null;
  stopUserIds: string[];
};

// Route and time the pool for one weekday given who is in that day. The driver
// may be a rotation driver, in which case the regular driver becomes a stop.
export async function planDay(
  pool: PoolWithMembers,
  weekday: Weekday,
  driver: Member,
  riders: Member[],
  overrides: Record<string, { arriveBy?: string | null; departEarliest?: string | null }> = {},
): Promise<DayPlan | null> {
  const direction = pool.direction as Direction;
  const stops = riders.map(memberStop);
  const d = {
    id: driver.userId,
    home: { lat: driver.user.homeLat!, lng: driver.user.homeLng! },
    maxDetourMin: driver.user.profile?.maxDetourMin ?? 10,
    seatsAvailable: driver.user.profile?.seatsAvailable ?? 0,
  };
  const r = await planRoute(d, stops, { lat: pool.site.lat, lng: pool.site.lng }, direction, route, { enforceCaps: false });
  if (!r.ok) return null;
  const schedules = [driver, ...riders].map((m) => scheduleFor(m, weekday, overrides[m.userId])).filter((s): s is EngineSchedule => Boolean(s));
  const times = schedules.length === riders.length + 1 ? poolTimesForDay(r.plan, direction, schedules) : null;
  return { weekday, driverId: driver.userId, plan: r.plan, times, stopUserIds: riders.map((m) => m.userId) };
}

export type WeekPlan = Partial<Record<Weekday, DayPlan>>;

// The pool's regular weekly plan (no exceptions, week-of-`date` rotation driver).
export async function weekPlan(pool: PoolWithMembers, date: string): Promise<WeekPlan> {
  const driver = driverForWeek(pool, date);
  if (!driver) return {};
  const out: WeekPlan = {};
  for (const wd of [1, 2, 3, 4, 5, 6, 7] as Weekday[]) {
    const driverDays = parseDays(driver.days);
    if (!driverDays.includes(wd)) continue;
    const riders = pool.members.filter((m) => m.userId !== driver.userId && parseDays(m.days).includes(wd));
    if (riders.length === 0) continue;
    const day = await planDay(pool, wd, driver, riders);
    if (day) out[wd] = day;
  }
  return out;
}

// Persist pickup times on members so the digest can quote them without routing.
export async function storePickupTimes(pool: PoolWithMembers, plan: WeekPlan) {
  const byUser: Record<string, Record<number, string>> = {};
  for (const day of Object.values(plan)) {
    if (!day?.times) continue;
    byUser[day.driverId] ??= {};
    byUser[day.driverId][day.weekday] = day.times.driverLeaves;
    for (const s of day.times.stops) {
      byUser[s.userId] ??= {};
      byUser[s.userId][day.weekday] = s.time;
    }
  }
  for (const m of pool.members) {
    await db.poolMember.update({ where: { id: m.id }, data: { pickupTimes: JSON.stringify(byUser[m.userId] ?? {}) } });
  }
}

export async function routeGeometryFor(day: DayPlan) {
  return routeGeometry(day.plan.points);
}

export const weekKeyOf = isoWeekKey;
