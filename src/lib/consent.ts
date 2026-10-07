import { db } from "./db";
import { leavePool } from "./pools/service";

// Withdrawing location consent stops every use of the home location: the user
// leaves their carpools (whose members could see the exact home), and every
// match involving them is removed from both sides. Deliberately not audited:
// the audit log is read by the school's administrators, and who withdrew is
// none of the employer's business. The Consent row is the record.
export async function withdrawLocation(userId: string) {
  await db.consent.updateMany({ where: { userId, scope: "LOCATION_SHARING", withdrawnAt: null }, data: { withdrawnAt: new Date() } });
  const memberships = await db.poolMember.findMany({ where: { userId, status: "ACTIVE" }, select: { poolId: true } });
  for (const m of memberships) await leavePool(m.poolId, userId);
  await db.match.deleteMany({ where: { OR: [{ driverId: userId }, { passengerId: userId }] } });
}
