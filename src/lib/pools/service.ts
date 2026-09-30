import { db } from "../db";
import { route } from "../geo/provider";
import { formatDays, parseDays } from "../enums";
import { insertStop, type PoolStop } from "../matching/insert";
import type { Direction, Weekday } from "../matching/types";
import { notify } from "../notify";
import { t, fmt } from "@/i18n";
import { loadPool, memberStop, storePickupTimes, weekPlan } from "./plan";
import { todayInZone } from "../time";
import { recomputeUser } from "../matching-service";

export const REQUEST_EXPIRY_DAYS = 7;

export type AcceptResult = { ok: true; poolId: string } | { ok: false; reason: string };

// Which of the two is the driver for this direction? The Match row knows; if it
// is gone (recomputed away) fall back to the profiles.
async function orientation(a: string, b: string, direction: string): Promise<{ driverId: string; passengerId: string }> {
  const m = await db.match.findFirst({
    where: { direction, OR: [{ driverId: a, passengerId: b }, { driverId: b, passengerId: a }] },
    orderBy: { score: "desc" },
  });
  if (m) return { driverId: m.driverId, passengerId: m.passengerId };
  const [pa, pb] = await Promise.all([db.commuteProfile.findUnique({ where: { userId: a } }), db.commuteProfile.findUnique({ where: { userId: b } })]);
  const aDrives = pa?.rideRole === "DRIVER" || (pa?.rideRole === "EITHER" && pb?.rideRole !== "DRIVER" && (pa.preferDriving || pb?.rideRole === "PASSENGER"));
  return aDrives ? { driverId: a, passengerId: b } : { driverId: b, passengerId: a };
}

async function activeDaysFor(userId: string, direction: Direction): Promise<number[]> {
  const entries = await db.scheduleEntry.findMany({ where: { userId, active: true } });
  return entries.filter((e) => (direction === "AM" ? e.wantsAm : e.wantsPm)).map((e) => e.weekday);
}

// §7.1: accept creates a Pool (if the driver has none for that direction) or adds
// a member, runs the multi-stop insertion (§6.7) and sends both parties the plan.
export async function acceptRequest(requestId: string, actingUserId: string): Promise<AcceptResult> {
  const req = await db.poolRequest.findUnique({ where: { id: requestId }, include: { fromUser: true, toUser: true } });
  if (!req || req.toUserId !== actingUserId || req.status !== "PENDING") return { ok: false, reason: t.app.forbidden };
  const direction = req.direction as Direction;
  const { driverId, passengerId } = await orientation(req.fromUserId, req.toUserId, direction);
  const driver = await db.user.findUniqueOrThrow({ where: { id: driverId }, include: { profile: true, org: true } });
  const passenger = await db.user.findUniqueOrThrow({ where: { id: passengerId }, include: { profile: true } });
  if (driver.homeLat == null || driver.homeLng == null || passenger.homeLat == null || passenger.homeLng == null) {
    return { ok: false, reason: t.app.somethingWentWrong };
  }

  let pool = await db.pool.findFirst({
    where: { direction, status: { in: ["ACTIVE", "PAUSED", "FORMING"] }, members: { some: { userId: driverId, memberRole: "DRIVER", status: "ACTIVE" } } },
    include: { site: true },
  });
  if (!pool) {
    const site = await db.scheduleEntry.findFirst({ where: { userId: driverId }, select: { siteId: true } });
    if (!site) return { ok: false, reason: t.app.somethingWentWrong };
    pool = await db.pool.create({
      data: {
        orgId: driver.orgId,
        siteId: site.siteId,
        direction,
        name: fmt(t.pools.nameFormat, { direction: direction === "AM" ? t.matches.am : t.matches.pm, driver: driver.name }),
        status: "ACTIVE",
        members: {
          create: { userId: driverId, memberRole: "DRIVER", days: formatDays(await activeDaysFor(driverId, direction)), stopOrder: 0 },
        },
      },
      include: { site: true },
    });
  }

  // Multi-stop insertion against the current passengers, in stop order.
  const existing = await db.poolMember.findMany({
    where: { poolId: pool.id, status: "ACTIVE", memberRole: "PASSENGER" },
    orderBy: { stopOrder: "asc" },
    include: { user: { include: { profile: true } } },
  });
  const stops: PoolStop[] = existing.map((m) => ({
    userId: m.userId,
    location: { lat: m.pickupLat ?? m.user.homeLat!, lng: m.pickupLng ?? m.user.homeLng! },
    maxExtraRideMin: m.user.profile?.maxExtraRideMin ?? 15,
  }));
  const newStop: PoolStop = { userId: passengerId, location: { lat: passenger.homeLat, lng: passenger.homeLng }, maxExtraRideMin: passenger.profile?.maxExtraRideMin ?? 15 };
  const result = await insertStop(
    { id: driverId, home: { lat: driver.homeLat, lng: driver.homeLng }, maxDetourMin: driver.profile?.maxDetourMin ?? 10, seatsAvailable: driver.profile?.seatsAvailable ?? 0 },
    stops,
    newStop,
    { lat: pool.site.lat, lng: pool.site.lng },
    direction,
    route,
  );
  if (!result.ok) {
    const reason = result.reason === "capacity" ? t.reasons.capacityFull : result.reason === "detour" ? t.reasons.detourTooLong : t.reasons.extraRideTooLong;
    return { ok: false, reason };
  }

  const days = parseDays(req.days);
  await db.$transaction([
    db.poolMember.create({ data: { poolId: pool.id, userId: passengerId, memberRole: "PASSENGER", days: formatDays(days), stopOrder: 0 } }),
    ...result.plan.order.map((s, i) => db.poolMember.updateMany({ where: { poolId: pool!.id, userId: s.userId }, data: { stopOrder: i + 1 } })),
    db.poolRequest.update({ where: { id: req.id }, data: { status: "ACCEPTED", respondedAt: new Date(), poolId: pool.id } }),
    db.match.updateMany({ where: { direction, OR: [{ driverId, passengerId }, { driverId: passengerId, passengerId: driverId }] }, data: { status: "CONVERTED" } }),
  ]);

  await replanAndNotify(pool.id, [driverId, passengerId], "accepted");
  // Seats changed for the driver; other candidates' capacity must be re-evaluated.
  await recomputeUser(driverId);
  await recomputeUser(passengerId);
  return { ok: true, poolId: pool.id };
}

// Recompute pickup times for everyone and tell members the plan changed.
export async function replanAndNotify(poolId: string, newlyJoined: string[] = [], reason: "accepted" | "changed" = "changed") {
  const pool = await loadPool(poolId);
  if (!pool) return;
  const plan = await weekPlan(pool, todayInZone("Europe/Brussels"));
  await storePickupTimes(pool, plan);
  for (const m of pool.members) {
    const joined = newlyJoined.includes(m.userId);
    if (reason === "accepted" && joined) {
      await notify(m.userId, "REQUEST_ACCEPTED", {
        title: fmt(t.notifications.requestAcceptedTitle, { name: pool.members.find((x) => x.userId !== m.userId)?.user.name ?? "" }),
        body: t.notifications.requestAcceptedBody,
        link: `/pools/${pool.id}`,
      });
    } else {
      await notify(m.userId, "POOL_PLAN_CHANGED", { title: t.notifications.planChangedTitle, body: t.notifications.planChangedBody, link: `/pools/${pool.id}` });
    }
  }
}

export async function declineRequest(requestId: string, actingUserId: string, reason?: string) {
  const req = await db.poolRequest.findUnique({ where: { id: requestId }, include: { toUser: true } });
  if (!req || req.toUserId !== actingUserId || req.status !== "PENDING") return;
  await db.poolRequest.update({ where: { id: requestId }, data: { status: "DECLINED", respondedAt: new Date(), message: reason ? `${req.message ?? ""}\n[declined: ${reason}]`.trim() : req.message } });
  await notify(req.fromUserId, "REQUEST_DECLINED", {
    title: fmt(t.notifications.requestDeclinedTitle, { name: req.toUser.name }),
    body: t.notifications.requestDeclinedBody,
    link: "/matches",
  });
}

export async function withdrawRequest(requestId: string, actingUserId: string) {
  const req = await db.poolRequest.findUnique({ where: { id: requestId } });
  if (!req || req.fromUserId !== actingUserId || req.status !== "PENDING") return;
  await db.poolRequest.update({ where: { id: requestId }, data: { status: "WITHDRAWN", respondedAt: new Date() } });
}

export async function expireRequests(): Promise<number> {
  const cutoff = new Date(Date.now() - REQUEST_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const r = await db.poolRequest.updateMany({ where: { status: "PENDING", createdAt: { lt: cutoff } }, data: { status: "EXPIRED", respondedAt: new Date() } });
  return r.count;
}

export async function isMember(poolId: string, userId: string): Promise<boolean> {
  return Boolean(await db.poolMember.findFirst({ where: { poolId, userId, status: "ACTIVE" } }));
}

export async function isDriver(poolId: string, userId: string): Promise<boolean> {
  return Boolean(await db.poolMember.findFirst({ where: { poolId, userId, status: "ACTIVE", memberRole: "DRIVER" } }));
}

export async function leavePool(poolId: string, userId: string) {
  const member = await db.poolMember.findFirst({ where: { poolId, userId, status: "ACTIVE" }, include: { user: true } });
  if (!member) return;
  await db.poolMember.update({ where: { id: member.id }, data: { status: "LEFT", leftAt: new Date() } });
  // Future trips no longer include them.
  await db.tripParticipant.deleteMany({ where: { userId, trip: { poolId, status: { in: ["PLANNED", "CONFIRMED"] } } } });
  const remaining = await db.poolMember.count({ where: { poolId, status: "ACTIVE" } });
  const wasDriver = member.memberRole === "DRIVER";
  if (wasDriver || remaining < 2) {
    await db.pool.update({ where: { id: poolId }, data: { status: "ENDED", endedAt: new Date() } });
    await db.trip.updateMany({ where: { poolId, status: { in: ["PLANNED", "CONFIRMED"] } }, data: { status: "CANCELLED" } });
    const others = await db.poolMember.findMany({ where: { poolId, status: "ACTIVE" } });
    for (const o of others) {
      await notify(o.userId, "POOL_PLAN_CHANGED", { title: t.notifications.planChangedTitle, body: `${member.user.name}: ${t.pools.leave}.`, link: "/pools" });
    }
  } else {
    await replanAndNotify(poolId);
  }
  // The pair is no longer converted; matching may pick them up again.
  await db.match.updateMany({ where: { status: "CONVERTED", OR: [{ driverId: userId }, { passengerId: userId }] }, data: { status: "SEEN" } });
  await recomputeUser(userId);
}

export async function setMeetingPoint(poolId: string, memberUserId: string, p: { lat: number; lng: number; label: string } | null) {
  await db.poolMember.updateMany({
    where: { poolId, userId: memberUserId, status: "ACTIVE" },
    data: p ? { pickupLat: p.lat, pickupLng: p.lng, pickupLabel: p.label } : { pickupLat: null, pickupLng: null, pickupLabel: null },
  });
  await replanAndNotify(poolId);
}

export async function setMemberDays(poolId: string, memberUserId: string, days: number[]) {
  await db.poolMember.updateMany({ where: { poolId, userId: memberUserId, status: "ACTIVE" }, data: { days: formatDays(days) } });
  await replanAndNotify(poolId);
}

export async function setPoolStatus(poolId: string, status: "ACTIVE" | "PAUSED") {
  await db.pool.update({ where: { id: poolId }, data: { status } });
  if (status === "PAUSED") await db.trip.updateMany({ where: { poolId, status: { in: ["PLANNED", "CONFIRMED"] } }, data: { status: "CANCELLED" } });
}

export async function setRotation(poolId: string, on: boolean) {
  await db.pool.update({ where: { id: poolId }, data: { rotateDrivers: on } });
  await replanAndNotify(poolId);
}

export { memberStop };
export type { Weekday };
