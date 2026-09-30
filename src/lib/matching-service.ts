import { db } from "./db";
import { route } from "./geo/provider";
import { computeMatches, pairKey } from "./matching/engine";
import type { Direction, EngineUser, MatchCandidate, UnmatchedReason, Weekday } from "./matching/types";
import { parseList, parseDays } from "./enums";

// Bridges Prisma rows and the pure engine. Match rows are a cache of engine
// output: upsert by (driver, passenger, direction), delete what the engine no
// longer produces, never touch CONVERTED rows.

export async function loadEngineUsers(orgId: string): Promise<EngineUser[]> {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: orgId }, select: { policyVersion: true } });
  const users = await db.user.findMany({
    where: {
      orgId,
      status: "ACTIVE",
      onboardingCompletedAt: { not: null },
      homeLat: { not: null },
      homeLng: { not: null },
      profile: { isNot: null },
      consents: { some: { scope: "LOCATION_SHARING", policyVersion: org.policyVersion, withdrawnAt: null } },
    },
    include: {
      profile: true,
      scheduleEntries: { where: { active: true } },
      poolMemberships: {
        where: { status: "ACTIVE", memberRole: "DRIVER", pool: { status: { in: ["ACTIVE", "PAUSED", "FORMING"] } } },
        include: { pool: { include: { members: { where: { status: "ACTIVE", memberRole: "PASSENGER" } } } } },
      },
      tripParticipations: { where: { status: { in: ["IN", "NO_SHOW"] }, trip: { status: { in: ["DONE", "NOT_HAPPENED"] } } }, include: { trip: { select: { status: true } } } },
    },
  });

  return users.map((u) => {
    const p = u.profile!;
    const schedule: EngineUser["schedule"] = {};
    for (const s of u.scheduleEntries) {
      schedule[s.weekday as Weekday] = {
        siteId: s.siteId,
        arriveBy: s.arriveBy,
        arriveFlexMin: s.arriveFlexMin,
        departEarliest: s.departEarliest,
        departFlexMin: s.departFlexMin,
        wantsAm: s.wantsAm,
        wantsPm: s.wantsPm,
      };
    }
    const seatsUsed: EngineUser["seatsUsed"] = {};
    for (const m of u.poolMemberships) {
      const dir = m.pool.direction as Direction;
      seatsUsed[dir] ??= {};
      for (const member of m.pool.members) {
        for (const wd of parseDays(member.days)) {
          seatsUsed[dir]![wd as Weekday] = (seatsUsed[dir]![wd as Weekday] ?? 0) + 1;
        }
      }
    }
    const planned = u.tripParticipations.length;
    const done = u.tripParticipations.filter((t) => t.status === "IN" && t.trip.status === "DONE").length;
    return {
      id: u.id,
      name: u.name,
      home: { lat: u.homeLat!, lng: u.homeLng! },
      gender: u.gender,
      profile: {
        rideRole: p.rideRole as EngineUser["profile"]["rideRole"],
        preferDriving: p.preferDriving,
        directions: p.directions as EngineUser["profile"]["directions"],
        seatsAvailable: p.seatsAvailable,
        maxDetourMin: p.maxDetourMin,
        pickupStyle: p.pickupStyle as EngineUser["profile"]["pickupStyle"],
        maxWalkM: p.maxWalkM,
        maxExtraRideMin: p.maxExtraRideMin,
        smoking: p.smoking as EngineUser["profile"]["smoking"],
        talk: p.talk as EngineUser["profile"]["talk"],
        music: p.music as EngineUser["profile"]["music"],
        genderPref: p.genderPref as EngineUser["profile"]["genderPref"],
        languages: parseList(p.languages),
        costMode: p.costMode as EngineUser["profile"]["costMode"],
      },
      schedule,
      plannedTrips: planned,
      doneTrips: done,
      seatsUsed,
    };
  });
}

async function loadPairSets(orgId: string) {
  const blocks = await db.block.findMany({
    where: { blocker: { orgId } },
    select: { blockerId: true, blockedId: true },
  });
  const blockedPairs = new Set(blocks.map((b) => pairKey(b.blockerId, b.blockedId)));
  const converted = await db.match.findMany({
    where: { orgId, status: "CONVERTED" },
    select: { driverId: true, passengerId: true, direction: true },
  });
  const convertedPairs = new Set(converted.map((m) => `${m.driverId}|${m.passengerId}|${m.direction}`));
  // Pairs already in a pool together count as converted for that direction even
  // if the pool formed without a Match row (e.g. a lift that became permanent).
  const pools = await db.pool.findMany({
    where: { orgId, status: { in: ["ACTIVE", "PAUSED", "FORMING"] } },
    include: { members: { where: { status: "ACTIVE" }, select: { userId: true, memberRole: true } } },
  });
  for (const pool of pools) {
    const drivers = pool.members.filter((m) => m.memberRole === "DRIVER");
    const passengers = pool.members.filter((m) => m.memberRole === "PASSENGER");
    for (const d of drivers) for (const p of passengers) {
      convertedPairs.add(`${d.userId}|${p.userId}|${pool.direction}`);
      convertedPairs.add(`${p.userId}|${d.userId}|${pool.direction}`);
    }
  }
  return { blockedPairs, convertedPairs };
}

export type RecomputeResult = { matches: number; ms: number; routeCalls: number; diagnostics: Map<string, UnmatchedReason> };

// Full recompute for one organisation (all sites), or only pairs involving `onlyUserIds`.
export async function recomputeOrg(orgId: string, onlyUserIds?: Set<string>): Promise<RecomputeResult> {
  const started = Date.now();
  const users = await loadEngineUsers(orgId);
  const sites = await db.site.findMany({ where: { orgId, active: true } });
  const pairSets = await loadPairSets(orgId);
  const diagnostics = new Map<string, UnmatchedReason>();
  let routeCalls = 0;
  const produced: MatchCandidate[] = [];

  for (const site of sites) {
    const out = await computeMatches({
      site: { id: site.id, location: { lat: site.lat, lng: site.lng } },
      users,
      router: route,
      ...pairSets,
      onlyUserIds,
    });
    routeCalls += out.routeCalls;
    produced.push(...out.matches);
    for (const [id, r] of out.diagnostics) if (!diagnostics.has(id)) diagnostics.set(id, r);
  }
  for (const m of produced) {
    diagnostics.delete(m.driverId);
    diagnostics.delete(m.passengerId);
  }

  const keep = new Set<string>();
  for (const c of produced) {
    const key = `${c.driverId}|${c.passengerId}|${c.direction}`;
    keep.add(key);
    const data = {
      orgId,
      siteId: c.siteId,
      score: c.score,
      sharedDays: c.sharedDays.join(","),
      detourMinAvg: c.detourMinAvg,
      detourMinMax: c.detourMinMax,
      extraRideMinAvg: c.extraRideMinAvg,
      details: JSON.stringify(c.details),
      computedAt: new Date(),
    };
    await db.match.upsert({
      where: { driverId_passengerId_direction: { driverId: c.driverId, passengerId: c.passengerId, direction: c.direction } },
      create: { ...data, driverId: c.driverId, passengerId: c.passengerId, direction: c.direction, status: "NEW" },
      // Keep SEEN/DISMISSED so a nightly run does not resurface hidden matches.
      update: data,
    });
  }

  // Delete stale rows: everything the engine could have produced but did not.
  const scope = onlyUserIds
    ? { OR: [{ driverId: { in: [...onlyUserIds] } }, { passengerId: { in: [...onlyUserIds] } }] }
    : {};
  const existing = await db.match.findMany({
    where: { orgId, status: { not: "CONVERTED" }, ...scope },
    select: { id: true, driverId: true, passengerId: true, direction: true },
  });
  const stale = existing.filter((m) => !keep.has(`${m.driverId}|${m.passengerId}|${m.direction}`)).map((m) => m.id);
  if (stale.length) await db.match.deleteMany({ where: { id: { in: stale } } });

  return { matches: produced.length, ms: Date.now() - started, routeCalls, diagnostics };
}

// §6.8: on any change to a user's home, profile or schedule.
export async function recomputeUser(userId: string): Promise<RecomputeResult> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { orgId: true } });
  return recomputeOrg(user.orgId, new Set([userId]));
}

// Diagnostics are not persisted with matches; the admin dashboard recomputes them on demand.
export async function unmatchedReasons(orgId: string): Promise<Map<string, UnmatchedReason>> {
  const users = await loadEngineUsers(orgId);
  const sites = await db.site.findMany({ where: { orgId, active: true } });
  const pairSets = await loadPairSets(orgId);
  const diagnostics = new Map<string, UnmatchedReason>();
  const matched = new Set<string>();
  for (const site of sites) {
    const out = await computeMatches({ site: { id: site.id, location: { lat: site.lat, lng: site.lng } }, users, router: route, ...pairSets });
    for (const m of out.matches) {
      matched.add(m.driverId);
      matched.add(m.passengerId);
    }
    for (const [id, r] of out.diagnostics) if (!diagnostics.has(id)) diagnostics.set(id, r);
  }
  for (const id of matched) diagnostics.delete(id);
  return diagnostics;
}
