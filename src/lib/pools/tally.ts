import { db } from "../db";
import { route } from "../geo/provider";

// Cost sharing must stay at or below real running costs: above that it is no
// longer carpooling but paid transport, with tax and insurance consequences.
// The school sets the rate (default 40 c/km, a placeholder for the official
// Belgian kilometre allowance); this ceiling holds even if the setting is wrong.
export const KM_RATE_CEILING_CENTS = 60;
export const cappedRate = (cents: number) => Math.max(0, Math.min(cents, KM_RATE_CEILING_CENTS));

export type Tally = { month: string; hidden: boolean; lines: Array<{ from: string; to: string; cents: number }>; names: Record<string, string> };

// §7.6: per DONE trip and passenger IN, contribution = direct km × rate ÷ participants (incl. driver).
// Netted per pair so rotation cancels out. Hidden when every member chose ALTERNATE.
export async function monthlyTally(poolId: string, month: string): Promise<Tally> {
  const pool = await db.pool.findUniqueOrThrow({
    where: { id: poolId },
    include: { org: true, site: true, members: { where: { status: "ACTIVE" }, include: { user: { include: { profile: true } } } } },
  });
  const names: Record<string, string> = {};
  for (const m of pool.members) names[m.userId] = m.user.name;
  const hidden = pool.members.length > 0 && pool.members.every((m) => m.user.profile?.costMode === "ALTERNATE");
  if (hidden) return { month, hidden, lines: [], names };

  const trips = await db.trip.findMany({
    where: { poolId, status: "DONE", date: { startsWith: month } },
    include: { participants: { include: { user: true } } },
  });
  const site = { lat: pool.site.lat, lng: pool.site.lng };
  const net = new Map<string, number>(); // "from|to" -> cents
  for (const trip of trips) {
    const riders = trip.participants.filter((p) => p.status === "IN" && p.userId && p.userId !== trip.driverId);
    const n = riders.length + 1;
    for (const p of riders) {
      if (!p.user || p.user.homeLat == null || p.user.homeLng == null) continue;
      const r = await route([{ lat: p.user.homeLat, lng: p.user.homeLng }, site]);
      const cents = Math.round(((r.distanceM / 1000) * cappedRate(pool.org.kmRateCents)) / n);
      const key = `${p.userId}|${trip.driverId}`;
      net.set(key, (net.get(key) ?? 0) + cents);
      if (!names[p.userId!]) names[p.userId!] = p.user.name;
    }
  }
  // Net opposite directions.
  const lines: Tally["lines"] = [];
  const seen = new Set<string>();
  for (const [key, cents] of net) {
    if (seen.has(key)) continue;
    const [a, b] = key.split("|");
    const back = net.get(`${b}|${a}`) ?? 0;
    seen.add(key);
    seen.add(`${b}|${a}`);
    const diff = cents - back;
    if (diff > 0) lines.push({ from: a, to: b, cents: diff });
    else if (diff < 0) lines.push({ from: b, to: a, cents: -diff });
  }
  return { month, hidden, lines, names };
}
