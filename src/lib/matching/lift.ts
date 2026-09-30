import type { LatLng } from "../geo/haversine";
import { evaluatePair, pairKey, preferencesCompatible } from "./engine";
import type { Direction, EngineUser, MatchCandidate, Router, Weekday } from "./types";

export type LiftDriver = {
  user: EngineUser;
  // Seats free on this specific date, after the driver's own pool members.
  seatsFreeToday: number;
  poolId?: string;
};

// §6.9: a one-off lift for a single date. Same filters as matching but for one
// weekday only and with the days score ignored. Returns the top five.
export async function findLift(
  passenger: EngineUser,
  weekday: Weekday,
  direction: Direction,
  drivers: LiftDriver[],
  site: { id: string; location: LatLng },
  router: Router,
  blockedPairs: Set<string>,
): Promise<Array<MatchCandidate & { poolId?: string }>> {
  const out: Array<MatchCandidate & { poolId?: string }> = [];
  for (const d of drivers) {
    if (d.user.id === passenger.id || d.seatsFreeToday < 1) continue;
    if (blockedPairs.has(pairKey(d.user.id, passenger.id))) continue;
    if (!preferencesCompatible(d.user, passenger)) continue;
    const sd = d.user.schedule[weekday];
    const sp = passenger.schedule[weekday];
    if (!sd || !sp || sd.siteId !== site.id || sp.siteId !== site.id) continue;
    // Treat the driver as having exactly the seats free today.
    const driver: EngineUser = {
      ...d.user,
      profile: { ...d.user.profile, seatsAvailable: d.seatsFreeToday },
      seatsUsed: {},
    };
    const r = await evaluatePair(driver, passenger, direction, [weekday], site, router, { ignoreDays: true });
    if (r.ok) out.push({ ...r.candidate, poolId: d.poolId });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 5);
}
