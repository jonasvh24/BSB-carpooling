import { createHash } from "node:crypto";
import { db } from "./db";

// §9.6: hard-delete the user and everything attached; anonymise trip history.
export async function deleteUserCascade(userId: string) {
  const placeholder = `deleted-${createHash("sha256").update(userId).digest("hex").slice(0, 12)}`;
  // Pools this user drove cannot continue without a driver.
  const driven = await db.poolMember.findMany({ where: { userId, memberRole: "DRIVER", status: "ACTIVE" }, select: { poolId: true } });
  await db.$transaction([
    db.tripParticipant.updateMany({ where: { userId }, data: { userId: null, anonymisedId: placeholder } }),
    db.trip.updateMany({ where: { driverId: userId, status: { in: ["PLANNED", "CONFIRMED"] } }, data: { status: "CANCELLED" } }),
    db.pool.updateMany({ where: { id: { in: driven.map((d) => d.poolId) } }, data: { status: "ENDED", endedAt: new Date() } }),
    // Trip.driverId is set to null by the schema; the participant row above keeps the placeholder.
    db.user.delete({ where: { id: userId } }),
  ]);
}

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
      tripParticipations: { include: { trip: { select: { date: true, direction: true, status: true } } } },
      messages: true,
      notifications: true,
      reportsMade: true,
      blocksMade: true,
    },
  });
  return { exportedAt: new Date().toISOString(), ...user };
}

// §9.7: trip logs anonymised 12 months after the pool ended.
export async function anonymiseOldTrips(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
  const pools = await db.pool.findMany({ where: { status: "ENDED", endedAt: { lt: cutoff } }, select: { id: true } });
  if (!pools.length) return 0;
  const r = await db.tripParticipant.updateMany({
    where: { userId: { not: null }, trip: { poolId: { in: pools.map((p) => p.id) } } },
    data: { userId: null, anonymisedId: "retention" },
  });
  return r.count;
}
