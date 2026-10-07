import { db } from "./db";
import { addDaysIso, todayInZone } from "./time";
import { scrubRoute } from "./pools/route-scrub";

// Every retention period in one place (GDPR Art. 5(1)(e): keep personal data no
// longer than needed). The privacy notice quotes these numbers; change both together.
export const RETENTION = {
  geocodeCacheDays: 7, // typed address text and reverse lookups
  routeCacheDays: 180, // route durations keyed by coordinates; regenerated on demand
  routePointsDays: 30, // home coordinates inside a stored trip route
  notificationDays: 90,
  closedRequestDays: 90,
  pastExceptionDays: 90,
  endedPoolChatDays: 30,
  invitationDays: 60, // unaccepted invitations
  resolvedReportDays: 365,
  auditDays: 365,
  tripAnonymiseDays: 365, // after the pool ended
  backupFiles: 30, // scripts/backup.sh keeps this many nightly copies
} as const;

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

// §9.7: trip logs anonymised 12 months after the pool ended.
export async function anonymiseOldTrips(now = new Date()): Promise<number> {
  const cutoff = daysAgo(now, RETENTION.tripAnonymiseDays);
  const pools = await db.pool.findMany({ where: { status: "ENDED", endedAt: { lt: cutoff } }, select: { id: true } });
  if (!pools.length) return 0;
  const poolIds = pools.map((p) => p.id);
  const r = await db.tripParticipant.updateMany({
    where: { userId: { not: null }, trip: { poolId: { in: poolIds } } },
    data: { userId: null, anonymisedId: "retention" },
  });
  // The stored route repeats the user ids and the driver; drop both with the participants.
  await db.trip.updateMany({ where: { poolId: { in: poolIds } }, data: { plannedRoute: null, driverId: null } });
  return r.count;
}

// Home coordinates are needed on a trip only until it has been driven and verified.
export async function scrubOldRoutes(now = new Date()): Promise<number> {
  const cutoff = addDaysIso(todayInZone("Europe/Brussels", now), -RETENTION.routePointsDays);
  const trips = await db.trip.findMany({ where: { date: { lt: cutoff }, plannedRoute: { contains: '"lat"' } }, select: { id: true, plannedRoute: true } });
  for (const trip of trips) {
    await db.trip.update({ where: { id: trip.id }, data: { plannedRoute: scrubRoute(trip.plannedRoute, {}) } });
  }
  return trips.length;
}

// Runs nightly from jobNightly. Each step is independent and idempotent.
export async function runRetention(now = new Date()) {
  const geoShort = await db.geoCache.deleteMany({ where: { kind: { in: ["GEOCODE", "REVERSE"] }, createdAt: { lt: daysAgo(now, RETENTION.geocodeCacheDays) } } });
  const geoRoutes = await db.geoCache.deleteMany({ where: { kind: "ROUTE", createdAt: { lt: daysAgo(now, RETENTION.routeCacheDays) } } });
  const routePoints = await scrubOldRoutes(now);
  const notifications = await db.notification.deleteMany({ where: { createdAt: { lt: daysAgo(now, RETENTION.notificationDays) } } });
  const requests = await db.poolRequest.deleteMany({ where: { status: { not: "PENDING" }, createdAt: { lt: daysAgo(now, RETENTION.closedRequestDays) } } });
  const exceptions = await db.scheduleException.deleteMany({ where: { date: { lt: addDaysIso(todayInZone("Europe/Brussels", now), -RETENTION.pastExceptionDays) } } });
  const messages = await db.message.deleteMany({ where: { pool: { status: "ENDED", endedAt: { lt: daysAgo(now, RETENTION.endedPoolChatDays) } } } });
  const invitations = await db.invitation.deleteMany({ where: { usedAt: null, createdAt: { lt: daysAgo(now, RETENTION.invitationDays) } } });
  const tokens = await db.verificationToken.deleteMany({ where: { expires: { lt: now } } });
  const reports = await db.report.deleteMany({ where: { status: "RESOLVED", resolvedAt: { lt: daysAgo(now, RETENTION.resolvedReportDays) } } });
  const audit = await db.auditLog.deleteMany({ where: { createdAt: { lt: daysAgo(now, RETENTION.auditDays) } } });
  const anonymised = await anonymiseOldTrips(now);
  return {
    geoCache: geoShort.count + geoRoutes.count,
    routePoints,
    notifications: notifications.count,
    requests: requests.count,
    exceptions: exceptions.count,
    messages: messages.count,
    invitations: invitations.count,
    tokens: tokens.count,
    reports: reports.count,
    audit: audit.count,
    anonymised,
  };
}
