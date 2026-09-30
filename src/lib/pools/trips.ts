import { db } from "../db";
import { parseDays } from "../enums";
import { isoWeekday } from "../time";

// When a schedule exception is added or removed, update the user's participation
// in any trip already materialised for that date (§7.4).
export async function applyExceptionToTrips(userId: string, date: string) {
  const exception = await db.scheduleException.findUnique({ where: { userId_date: { userId, date } } });
  const participations = await db.tripParticipant.findMany({
    where: { userId, trip: { date, status: { in: ["PLANNED", "CONFIRMED"] } } },
    include: { trip: { include: { pool: { include: { members: { where: { userId, status: "ACTIVE" } } } } } } },
  });
  for (const p of participations) {
    const member = p.trip.pool.members[0];
    const onThatDay = member ? parseDays(member.days).includes(isoWeekday(date)) : false;
    const status = exception?.kind === "OFF" ? "OUT" : onThatDay ? "IN" : "OUT";
    if (p.status !== status && p.status !== "NO_SHOW") {
      await db.tripParticipant.update({ where: { id: p.id }, data: { status, respondedAt: new Date() } });
    }
  }
}
