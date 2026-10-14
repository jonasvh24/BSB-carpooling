import { randomUUID } from "node:crypto";
import { db } from "./db";
import { ptKey } from "./geo/haversine";
import { scrubRoute } from "./pools/route-scrub";
import { t, fmt } from "@/i18n";

// §9.6: hard-delete the user and everything attached; anonymise trip history.
// Rows with a user relation go by cascade. The rest of this function reaches the
// places the cascade cannot: tables keyed by email or by coordinates, JSON
// columns, and text that contains the person's name (docs/legal/DATA_MAP.md).
export async function deleteUserCascade(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, homeLat: true, homeLng: true } });
  if (!user) return;
  // Random, so the placeholder cannot be recomputed from the user id that stays in the audit log.
  const placeholder = `deleted-${randomUUID().slice(0, 12)}`;
  // Pools this user drove cannot continue without a driver.
  const driven = await db.poolMember.findMany({ where: { userId, memberRole: "DRIVER" }, select: { poolId: true, status: true, pool: { select: { direction: true } } } });
  const activeDriven = driven.filter((d) => d.status === "ACTIVE").map((d) => d.poolId);
  const routes = await db.trip.findMany({
    where: { plannedRoute: { not: null }, OR: [{ driverId: userId }, { participants: { some: { userId } } }] },
    select: { id: true, plannedRoute: true },
  });

  await db.$transaction([
    ...routes.map((r) => db.trip.update({ where: { id: r.id }, data: { plannedRoute: scrubRoute(r.plannedRoute, { [userId]: placeholder }) } })),
    db.tripParticipant.updateMany({ where: { userId }, data: { userId: null, anonymisedId: placeholder } }),
    db.trip.updateMany({ where: { driverId: userId, status: { in: ["PLANNED", "CONFIRMED"] } }, data: { status: "CANCELLED" } }),
    db.pool.updateMany({ where: { id: { in: activeDriven } }, data: { status: "ENDED", endedAt: new Date() } }),
    // Pool names are "{direction} carpool with {driver}".
    ...driven.map((d) =>
      db.pool.update({ where: { id: d.poolId }, data: { name: fmt(t.pools.nameDeleted, { direction: d.pool.direction === "AM" ? t.matches.am : t.matches.pm }) } }),
    ),
    db.invitation.deleteMany({ where: { email: user.email } }),
    // Reset and sign-up codes are keyed by address with a prefix (password-reset.ts, signup-code.ts).
    db.verificationToken.deleteMany({ where: { identifier: { in: [user.email, `pwreset:${user.email}`, `signup:${user.email}`] } } }),
    db.rateLimitHit.deleteMany({ where: { key: { endsWith: `:${user.email}` } } }),
    // Trip.driverId is set to null by the schema; the participant row above keeps the placeholder.
    db.user.delete({ where: { id: userId } }),
  ]);

  // Cached lookups and routes that start, end or pass through the home.
  if (user.homeLat != null && user.homeLng != null) {
    const pt = ptKey({ lat: user.homeLat, lng: user.homeLng });
    await db.geoCache.deleteMany({ where: { key: { contains: pt } } });
  }
}

// Relations of User that the export leaves out, with the reason. The export test
// fails when a new relation is added to the schema without a decision here.
export const EXPORT_EXCLUDED: Record<string, string> = {
  org: "organisation settings, not the user's data",
  accounts: "unused (no OAuth providers)",
  sessions: "unused (JWT sessions)",
  reportsReceived: "written by another person about the user; disclosure is decided case by case (LAWYER_QUESTIONS Q12)",
  blocksReceived: "would reveal who blocked the user",
};

// §9.6: everything held about the user, as one JSON document.
export async function exportUserData(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      profile: true,
      scheduleEntries: true,
      scheduleExceptions: true,
      surveyResponses: true,
      consents: true,
      matchesAsDriver: true,
      matchesAsPassenger: true,
      requestsSent: true,
      requestsReceived: true,
      poolMemberships: { include: { pool: { select: { id: true, name: true, direction: true, status: true } } } },
      tripsDriven: { select: { id: true, date: true, direction: true, status: true, verified: true, plannedDepart: true, distanceM: true, kmSaved: true } },
      tripParticipations: { include: { trip: { select: { date: true, direction: true, status: true } } } },
      messages: true,
      notifications: true,
      reportsMade: true,
      blocksMade: true,
    },
  });
  const [invitation, activity] = await Promise.all([
    db.invitation.findUnique({ where: { email: user.email } }),
    db.auditLog.findMany({ where: { actorId: userId }, select: { action: true, targetType: true, targetId: true, details: true, createdAt: true } }),
  ]);
  return { exportedAt: new Date().toISOString(), ...user, invitation, activity };
}

// Research consent refused or withdrawn: the answers go, and the consent row is
// closed. Aggregates only ever read answers of people with an open consent.
export async function withdrawResearch(userId: string) {
  await db.$transaction([
    db.consent.updateMany({ where: { userId, scope: "PILOT_RESEARCH", withdrawnAt: null }, data: { withdrawnAt: new Date() } }),
    db.surveyResponse.deleteMany({ where: { userId } }),
  ]);
}
