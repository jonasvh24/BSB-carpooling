import { z } from "zod";
import { db } from "./db";
import { haversineKm } from "./geo/haversine";
import type { Reason, Weekday } from "./matching/types";

export const MatchDetails = z.object({
  days: z.record(
    z.string(),
    z.object({
      pickupTime: z.string(),
      siteTime: z.string(),
      driverLeaves: z.string(),
      detourMin: z.number(),
      extraRideMin: z.number(),
      score: z.number(),
    }),
  ),
  reasons: z.array(z.object({ code: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])).optional() })),
  estimated: z.boolean().default(false),
  rotation: z.boolean().default(false),
});
export type MatchDetails = z.infer<typeof MatchDetails>;

export function parseDetails(text: string): MatchDetails {
  const r = MatchDetails.safeParse(JSON.parse(text));
  return r.success ? r.data : { days: {}, reasons: [], estimated: false, rotation: false };
}

export type MatchView = {
  id: string;
  direction: "AM" | "PM";
  score: number;
  sharedDays: Weekday[];
  detourMinAvg: number;
  iDrive: boolean;
  rotation: boolean;
  estimated: boolean;
  reasons: Reason[];
  days: MatchDetails["days"];
  status: string;
  other: {
    id: string;
    name: string;
    photoUrl: string | null;
    approx: { lat: number; lng: number } | null;
    vehicleDesc: string | null;
    notes: string | null;
    reliability: { planned: number; done: number } | null;
  };
  pendingRequestId: string | null;
  pendingDirection: "in" | "out" | null;
};

// Matches for one user, shaped for the list. Marks NEW rows as SEEN.
export async function loadMatchesFor(userId: string): Promise<MatchView[]> {
  const rows = await db.match.findMany({
    where: { OR: [{ driverId: userId }, { passengerId: userId }], status: { in: ["NEW", "SEEN"] } },
    include: {
      driver: { include: { profile: true } },
      passenger: { include: { profile: true } },
    },
    orderBy: { score: "desc" },
  });
  await db.match.updateMany({ where: { id: { in: rows.filter((r) => r.status === "NEW").map((r) => r.id) } }, data: { status: "SEEN" } });

  const otherIds = rows.map((r) => (r.driverId === userId ? r.passengerId : r.driverId));
  const pending = await db.poolRequest.findMany({
    where: { status: "PENDING", OR: [{ fromUserId: userId, toUserId: { in: otherIds } }, { toUserId: userId, fromUserId: { in: otherIds } }] },
  });
  const history = await db.tripParticipant.groupBy({
    by: ["userId", "status"],
    where: { userId: { in: otherIds }, trip: { status: { in: ["DONE", "NOT_HAPPENED"] } }, status: { in: ["IN", "NO_SHOW"] } },
    _count: true,
  });
  const doneByUser = await db.tripParticipant.groupBy({
    by: ["userId"],
    where: { userId: { in: otherIds }, trip: { status: "DONE" }, status: "IN" },
    _count: true,
  });

  return rows.map((r) => {
    const iDrive = r.driverId === userId;
    const other = iDrive ? r.passenger : r.driver;
    const details = parseDetails(r.details);
    const planned = history.filter((h) => h.userId === other.id).reduce((s, h) => s + h._count, 0);
    const done = doneByUser.find((h) => h.userId === other.id)?._count ?? 0;
    const req = pending.find((p) => p.fromUserId === other.id || p.toUserId === other.id) ?? null;
    return {
      id: r.id,
      direction: r.direction as "AM" | "PM",
      score: r.score,
      sharedDays: r.sharedDays.split(",").map(Number) as Weekday[],
      detourMinAvg: r.detourMinAvg,
      iDrive,
      rotation: details.rotation,
      estimated: details.estimated,
      reasons: details.reasons as Reason[],
      days: details.days,
      status: r.status,
      other: {
        id: other.id,
        name: other.name,
        photoUrl: other.photoUrl,
        // §9.2: only the approximate cell is ever sent to a non-pool member.
        approx: other.approxLat != null && other.approxLng != null ? { lat: other.approxLat, lng: other.approxLng } : null,
        vehicleDesc: !iDrive ? (other.profile?.vehicleDesc ?? null) : null,
        notes: other.profile?.notes ?? null,
        reliability: planned >= 5 ? { planned, done } : null,
      },
      pendingRequestId: req?.id ?? null,
      pendingDirection: req ? (req.fromUserId === userId ? "out" : "in") : null,
    };
  });
}

// Smallest count the cold-start message will show. With one or two, moving your
// own pin and watching the number change would point at a single colleague.
export const COLD_START_MIN = 3;

// Cold start (§5 completion): colleagues within 8 km who have not finished setting
// up. These people have not consented yet, so the distance is measured between
// approximate cells, never between exact homes, and small counts are reported as 0.
export async function countNearbyIncomplete(userId: string): Promise<number> {
  const me = await db.user.findUnique({ where: { id: userId }, select: { orgId: true, approxLat: true, approxLng: true } });
  if (me?.approxLat == null || me.approxLng == null) return 0;
  const others = await db.user.findMany({
    where: { orgId: me.orgId, id: { not: userId }, status: "ACTIVE", onboardingCompletedAt: null, approxLat: { not: null }, approxLng: { not: null } },
    select: { approxLat: true, approxLng: true },
  });
  const here = { lat: me.approxLat, lng: me.approxLng };
  const n = others.filter((o) => haversineKm(here, { lat: o.approxLat!, lng: o.approxLng! }) <= 8).length;
  return n >= COLD_START_MIN ? n : 0;
}
