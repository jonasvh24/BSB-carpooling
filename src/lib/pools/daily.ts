import { z } from "zod";
import { db } from "../db";
import { route } from "../geo/provider";
import { parseDays } from "../enums";
import { notify } from "../notify";
import { t, fmt } from "@/i18n";
import { addDaysIso, isoWeekday, nextBusinessDay, todayInZone } from "../time";
import { driverForWeek, loadPool, planDay, type PoolWithMembers } from "./plan";
import type { Direction, Weekday } from "../matching/types";

export const PlannedRoute = z.object({
  driverId: z.string(),
  driverLeaves: z.string(),
  siteTime: z.string(),
  stops: z.array(z.object({ userId: z.string(), time: z.string(), label: z.string().nullable() })),
  points: z.array(z.object({ lat: z.number(), lng: z.number() })),
  estimated: z.boolean(),
});
export type PlannedRoute = z.infer<typeof PlannedRoute>;

export function parsePlannedRoute(text: string | null): PlannedRoute | null {
  if (!text) return null;
  const r = PlannedRoute.safeParse(JSON.parse(text));
  return r.success ? r.data : null;
}

// §7.4: materialise one pool's trip for a date. Idempotent: existing trips are left alone.
export async function materialiseTrip(pool: PoolWithMembers, date: string, nonWorking: Set<string>): Promise<{ id: string; created: boolean } | null> {
  if (pool.status !== "ACTIVE" || nonWorking.has(date)) return null;
  const weekday = isoWeekday(date) as Weekday;
  const existing = await db.trip.findUnique({ where: { poolId_date_direction: { poolId: pool.id, date, direction: pool.direction } } });
  if (existing) return { id: existing.id, created: false };

  const driver = driverForWeek(pool, date);
  if (!driver || !parseDays(driver.days).includes(weekday)) return null;
  const exceptions = await db.scheduleException.findMany({ where: { date, userId: { in: pool.members.map((m) => m.userId) } } });
  const exc = new Map(exceptions.map((e) => [e.userId, e]));
  if (exc.get(driver.userId)?.kind === "OFF") return null;

  const ridersToday = pool.members.filter((m) => m.userId !== driver.userId && parseDays(m.days).includes(weekday) && exc.get(m.userId)?.kind !== "OFF");
  if (ridersToday.length === 0) return null;
  const overrides: Record<string, { arriveBy?: string | null; departEarliest?: string | null }> = {};
  for (const e of exceptions) if (e.kind === "CHANGED") overrides[e.userId] = { arriveBy: e.arriveBy, departEarliest: e.departEarliest };
  const day = await planDay(pool, weekday, driver, ridersToday, overrides);
  if (!day || !day.times) return null;

  const planned: PlannedRoute = {
    driverId: driver.userId,
    driverLeaves: day.times.driverLeaves,
    siteTime: day.times.siteTime,
    stops: day.times.stops.map((s) => ({ ...s, label: pool.members.find((m) => m.userId === s.userId)?.pickupLabel ?? null })),
    points: day.plan.points,
    estimated: day.plan.estimated,
  };
  const trip = await db.trip.create({
    data: {
      poolId: pool.id,
      date,
      direction: pool.direction,
      driverId: driver.userId,
      status: "PLANNED",
      plannedDepart: day.times.driverLeaves,
      plannedRoute: JSON.stringify(planned),
      distanceM: Math.round(day.plan.distanceM),
      participants: {
        create: [
          // The driver defaults to IN and must actively cancel (§7.4).
          { userId: driver.userId, status: "IN" },
          ...pool.members
            .filter((m) => m.userId !== driver.userId && parseDays(m.days).includes(weekday))
            .map((m) => ({ userId: m.userId, status: exc.get(m.userId)?.kind === "OFF" ? "OUT" : "IN" })),
        ],
      },
    },
  });
  return { id: trip.id, created: true };
}

export async function nonWorkingDays(orgId: string): Promise<Set<string>> {
  return new Set((await db.nonWorkingDay.findMany({ where: { orgId }, select: { date: true } })).map((d) => d.date));
}

// Next business day's trips for every ACTIVE pool in the organisation.
export async function materialiseTomorrow(orgId: string, now = new Date()): Promise<{ date: string; created: number }> {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: orgId } });
  const today = todayInZone(org.timezone, now);
  const nw = await nonWorkingDays(orgId);
  const date = nextBusinessDay(today, nw);
  const pools = await db.pool.findMany({ where: { orgId, status: "ACTIVE" }, select: { id: true } });
  let created = 0;
  for (const p of pools) {
    const pool = await loadPool(p.id);
    if (pool && (await materialiseTrip(pool, date, nw))?.created) created++;
  }
  return { date, created };
}

// 18:00 digest: one tap to confirm or opt out. Driver is told they are in unless they cancel.
export async function sendDigest(orgId: string, date: string) {
  const trips = await db.trip.findMany({
    where: { pool: { orgId }, date, status: { in: ["PLANNED", "CONFIRMED"] } },
    include: { participants: { include: { user: true } }, pool: true },
  });
  let sent = 0;
  for (const trip of trips) {
    const planned = parsePlannedRoute(trip.plannedRoute);
    for (const p of trip.participants) {
      if (p.status !== "IN" || !p.userId) continue;
      const already = await db.notification.findFirst({ where: { userId: p.userId, kind: "DAILY_DIGEST", link: `/trips/${trip.id}` } });
      if (already) continue;
      const isDriver = p.userId === trip.driverId;
      const stop = planned?.stops.find((s) => s.userId === p.userId);
      await notify(p.userId, "DAILY_DIGEST", {
        title: isDriver
          ? fmt(t.trips.digestDriverTitle, { time: trip.plannedDepart })
          : fmt(t.trips.digestTitle, { time: stop?.time ?? trip.plannedDepart, place: stop?.label ?? (trip.direction === "AM" ? t.onboarding.role.pickupDoor : t.pools.dropOff) }),
        body: isDriver ? t.trips.digestDriverBody : t.trips.digestBody,
        link: `/trips/${trip.id}`,
      });
      sent++;
    }
  }
  return sent;
}

export async function tripAccess(tripId: string, userId: string) {
  const trip = await db.trip.findUnique({
    where: { id: tripId },
    include: { pool: { include: { site: true, members: { where: { status: "ACTIVE" }, include: { user: true } } } }, participants: { include: { user: true } }, driver: true },
  });
  if (!trip) return null;
  const member = trip.participants.some((p) => p.userId === userId) || trip.pool.members.some((m) => m.userId === userId);
  return member ? trip : null;
}

export async function confirmTrip(tripId: string, userId: string) {
  const trip = await tripAccess(tripId, userId);
  if (!trip || !["PLANNED", "CONFIRMED"].includes(trip.status)) return;
  await db.tripParticipant.upsert({
    where: { tripId_userId: { tripId, userId } },
    create: { tripId, userId, status: "IN", respondedAt: new Date() },
    update: { status: "IN", respondedAt: new Date() },
  });
  // The trip is CONFIRMED once the driver has confirmed (§7.4).
  if (userId === trip.driverId) await db.trip.update({ where: { id: tripId }, data: { status: "CONFIRMED" } });
}

export async function optOutTrip(tripId: string, userId: string) {
  const trip = await tripAccess(tripId, userId);
  if (!trip || !["PLANNED", "CONFIRMED"].includes(trip.status)) return;
  if (userId === trip.driverId) return driverCancel(tripId, userId);
  await db.tripParticipant.upsert({
    where: { tripId_userId: { tripId, userId } },
    create: { tripId, userId, status: "OUT", respondedAt: new Date() },
    update: { status: "OUT", respondedAt: new Date() },
  });
}

// §7.5: immediate notification to all members; the trip page offers lifts.
export async function driverCancel(tripId: string, driverId: string) {
  const trip = await tripAccess(tripId, driverId);
  if (!trip || trip.driverId !== driverId || !["PLANNED", "CONFIRMED"].includes(trip.status)) return;
  await db.trip.update({ where: { id: tripId }, data: { status: "CANCELLED" } });
  await db.tripParticipant.updateMany({ where: { tripId, userId: driverId }, data: { status: "OUT", respondedAt: new Date() } });
  for (const p of trip.participants) {
    if (!p.userId || p.userId === driverId) continue;
    await notify(p.userId, "DRIVER_CANCELLED", {
      title: fmt(t.trips.driverCancelTitle, { date: trip.date, direction: trip.direction === "AM" ? t.matches.am : t.matches.pm }),
      body: fmt(t.trips.driverCancelBody, { name: trip.driver?.name ?? "" }),
      link: `/trips/${tripId}`,
    });
  }
}

// 20:00 prompt to the driver of every trip that happened today.
export async function sendVerificationPrompts(orgId: string, date: string) {
  const trips = await db.trip.findMany({ where: { pool: { orgId }, date, status: { in: ["PLANNED", "CONFIRMED"] }, driverId: { not: null } } });
  let sent = 0;
  for (const trip of trips) {
    if (!trip.driverId) continue;
    const already = await db.notification.findFirst({ where: { userId: trip.driverId, kind: "TRIP_VERIFICATION", link: `/trips/${trip.id}` } });
    if (already) continue;
    await notify(trip.driverId, "TRIP_VERIFICATION", { title: t.trips.verifyNotifTitle, body: t.trips.verifyNotifBody, link: `/trips/${trip.id}` });
    sent++;
  }
  return sent;
}

// Km saved (§8.2): direct km for passengers who answered "car alone", minus the driver's detour km.
async function computeKmSaved(tripId: string): Promise<number> {
  const trip = await db.trip.findUniqueOrThrow({ where: { id: tripId }, include: { pool: { include: { site: true } }, participants: { include: { user: { include: { surveyResponses: { where: { surveyKey: "ONBOARDING" } } } } } } } });
  const site = { lat: trip.pool.site.lat, lng: trip.pool.site.lng };
  let saved = 0;
  let directSum = 0;
  for (const p of trip.participants) {
    if (p.status !== "IN" || !p.user || p.userId === trip.driverId || p.user.homeLat == null || p.user.homeLng == null) continue;
    const r = await route([{ lat: p.user.homeLat, lng: p.user.homeLng }, site]);
    directSum += r.distanceM / 1000;
    const answers = p.user.surveyResponses[0] ? (JSON.parse(p.user.surveyResponses[0].answers) as { r1?: string }) : {};
    if (answers.r1 === "CAR_ALONE") saved += r.distanceM / 1000;
  }
  const driver = trip.driverId ? await db.user.findUnique({ where: { id: trip.driverId } }) : null;
  if (driver?.homeLat != null && driver.homeLng != null && trip.distanceM) {
    const direct = await route([{ lat: driver.homeLat, lng: driver.homeLng }, site]);
    const detourKm = Math.max(0, trip.distanceM / 1000 - direct.distanceM / 1000);
    saved = Math.max(0, saved - detourKm);
  }
  void directSum;
  return Math.round(saved * 100) / 100;
}

export async function verifyTrip(tripId: string, driverId: string, outcome: "DONE" | "NOT_HAPPENED" | "NO_SHOW", noShowUserIds: string[] = []) {
  const trip = await tripAccess(tripId, driverId);
  if (!trip || trip.driverId !== driverId || trip.status === "CANCELLED") return;
  if (outcome === "NOT_HAPPENED") {
    await db.trip.update({ where: { id: tripId }, data: { status: "NOT_HAPPENED", verified: true } });
    return;
  }
  if (outcome === "NO_SHOW" && noShowUserIds.length) {
    await db.tripParticipant.updateMany({ where: { tripId, userId: { in: noShowUserIds } }, data: { status: "NO_SHOW" } });
  }
  const kmSaved = await computeKmSaved(tripId);
  await db.trip.update({ where: { id: tripId }, data: { status: "DONE", verified: true, kmSaved } });
}

// 72 hours without an answer: DONE, unverified (§7.4).
export async function autoCloseTrips(now = new Date()): Promise<number> {
  const cutoff = addDaysIso(todayInZone("Europe/Brussels", now), -3);
  const stale = await db.trip.findMany({ where: { status: { in: ["PLANNED", "CONFIRMED"] }, date: { lte: cutoff } } });
  for (const trip of stale) {
    const kmSaved = await computeKmSaved(trip.id);
    await db.trip.update({ where: { id: trip.id }, data: { status: "DONE", verified: false, kmSaved } });
  }
  return stale.length;
}

// Public transport fallback needs no key: a Google Maps transit deep link (§7.5).
export function transitUrl(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=transit`;
}

export type { Direction };
