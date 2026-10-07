import { db } from "../db";
import { route } from "../geo/provider";
import { parseDays } from "../enums";
import { loadEngineUsers } from "../matching-service";
import { pairKey } from "../matching/engine";
import { findLift, type LiftDriver } from "../matching/lift";
import type { Direction, Weekday } from "../matching/types";
import { isoWeekday } from "../time";
import { notify } from "../notify";
import { t, fmt } from "@/i18n";
import { loadPool, driverForWeek } from "./plan";
import { materialiseTrip, nonWorkingDays } from "./daily";

// §6.9 / §7.5: drivers of ACTIVE pools with a free seat that day plus standalone drivers.
export async function liftsFor(passengerId: string, date: string, direction: Direction, siteId: string) {
  const passenger = await db.user.findUniqueOrThrow({ where: { id: passengerId } });
  const users = await loadEngineUsers(passenger.orgId);
  const me = users.find((u) => u.id === passengerId);
  const site = await db.site.findUniqueOrThrow({ where: { id: siteId } });
  if (!me) return [];
  const weekday = isoWeekday(date) as Weekday;

  const pools = await db.pool.findMany({
    where: { orgId: passenger.orgId, status: "ACTIVE", direction },
    include: { members: { where: { status: "ACTIVE" } }, trips: { where: { date }, include: { participants: true } } },
  });
  const drivers: LiftDriver[] = [];
  const inPool = new Set<string>();
  for (const pool of pools) {
    const full = await loadPool(pool.id);
    const driver = full ? driverForWeek(full, date) : null;
    if (!driver) continue;
    for (const m of pool.members) inPool.add(m.userId);
    const u = users.find((x) => x.id === driver.userId);
    if (!u) continue;
    const trip = pool.trips[0];
    const taken = trip
      ? trip.participants.filter((p) => p.status === "IN" && p.userId !== driver.userId).length
      : pool.members.filter((m) => m.memberRole === "PASSENGER" && parseDays(m.days).includes(weekday)).length;
    if (trip && trip.status === "CANCELLED") continue;
    drivers.push({ user: u, seatsFreeToday: u.profile.seatsAvailable - taken, poolId: pool.id });
  }
  for (const u of users) {
    if (inPool.has(u.id) || u.id === passengerId) continue;
    if (u.profile.rideRole === "PASSENGER" || u.profile.seatsAvailable < 1) continue;
    drivers.push({ user: u, seatsFreeToday: u.profile.seatsAvailable });
  }
  const blocks = await db.block.findMany({ where: { OR: [{ blockerId: passengerId }, { blockedId: passengerId }] } });
  const blocked = new Set(blocks.map((b) => pairKey(b.blockerId, b.blockedId)));
  const lifts = await findLift(me, weekday, direction, drivers, { id: siteId, location: { lat: site.lat, lng: site.lng } }, route, blocked);
  const names = await db.user.findMany({ where: { id: { in: lifts.map((l) => l.driverId) } }, select: { id: true, name: true, photoUrl: true } });
  return lifts.map((l) => ({ ...l, driver: names.find((n) => n.id === l.driverId)! }));
}

// Accepting a lift creates (or joins) that day's trip under the driver's pool.
export async function acceptLift(passengerId: string, driverId: string, date: string, direction: Direction, siteId: string): Promise<string | null> {
  const passenger = await db.user.findUniqueOrThrow({ where: { id: passengerId } });
  let pool = await db.pool.findFirst({
    where: { orgId: passenger.orgId, direction, status: { in: ["ACTIVE", "FORMING"] }, members: { some: { userId: driverId, memberRole: "DRIVER", status: "ACTIVE" } } },
  });
  if (!pool) {
    // Standalone driver: a FORMING pool holds the one-off trip without counting as an active pool.
    const driver = await db.user.findUniqueOrThrow({ where: { id: driverId } });
    pool = await db.pool.create({
      data: {
        orgId: passenger.orgId,
        siteId,
        direction,
        name: fmt(t.pools.nameFormat, { direction: direction === "AM" ? t.matches.am : t.matches.pm, driver: driver.name }),
        status: "FORMING",
        // The driver is "in" on the day of the lift, otherwise no trip can be planned for it.
        members: { create: { userId: driverId, memberRole: "DRIVER", days: String(isoWeekday(date)), stopOrder: 0 } },
      },
    });
  }
  let trip = await db.trip.findUnique({ where: { poolId_date_direction: { poolId: pool.id, date, direction } } });
  if (!trip) {
    const full = await loadPool(pool.id);
    // Temporarily treat the passenger as a member for that weekday so the plan includes them.
    if (full) {
      const weekday = isoWeekday(date);
      const pUser = await db.user.findUniqueOrThrow({ where: { id: passengerId }, include: { profile: true, scheduleEntries: true } });
      full.members.push({
        id: "temp",
        poolId: pool.id,
        userId: passengerId,
        memberRole: "PASSENGER",
        days: String(weekday),
        pickupLat: null,
        pickupLng: null,
        pickupLabel: null,
        stopOrder: 99,
        pickupTimes: "{}",
        status: "ACTIVE",
        joinedAt: new Date(),
        leftAt: null,
        user: pUser,
      });
      const poolStatus = full.status;
      full.status = "ACTIVE";
      const nw = await nonWorkingDays(passenger.orgId);
      const made = await materialiseTrip(full, date, nw);
      full.status = poolStatus;
      if (made) trip = await db.trip.findUnique({ where: { id: made.id } });
    }
  }
  if (!trip) return null;
  await db.tripParticipant.upsert({
    where: { tripId_userId: { tripId: trip.id, userId: passengerId } },
    create: { tripId: trip.id, userId: passengerId, status: "IN", respondedAt: new Date() },
    update: { status: "IN", respondedAt: new Date() },
  });
  await notify(driverId, "POOL_PLAN_CHANGED", { title: t.notifications.planChangedTitle, body: `${passenger.name}: ${t.trips.liftAccepted}`, link: `/trips/${trip.id}` });
  return trip.id;
}
