import { db } from "../lib/db";
import { approximateLocation } from "../lib/geo/approx";
import type { LatLng } from "../lib/geo/haversine";

// Minimal rows for integration tests. Everything is created against unit.db.
export async function resetDb() {
  await db.$transaction([
    db.report.deleteMany(),
    db.block.deleteMany(),
    db.invitation.deleteMany(),
    db.verificationToken.deleteMany(),
    db.tripParticipant.deleteMany(),
    db.trip.deleteMany(),
    db.message.deleteMany(),
    db.poolRequest.deleteMany(),
    db.poolMember.deleteMany(),
    db.pool.deleteMany(),
    db.match.deleteMany(),
    db.notification.deleteMany(),
    db.scheduleException.deleteMany(),
    db.scheduleEntry.deleteMany(),
    db.surveyResponse.deleteMany(),
    db.consent.deleteMany(),
    db.commuteProfile.deleteMany(),
    db.nonWorkingDay.deleteMany(),
    db.auditLog.deleteMany(),
    db.user.deleteMany(),
    db.site.deleteMany(),
    db.organisation.deleteMany(),
    db.geoCache.deleteMany(),
  ]);
}

let orgSeq = 0;
export async function makeOrg(domain = "example.org") {
  const org = await db.organisation.create({ data: { name: "Test", slug: `test-${Date.now()}-${orgSeq++}`, allowedEmailDomains: domain, kmRateCents: 40 } });
  const site = await db.site.create({ data: { orgId: org.id, name: "Campus", address: "", lat: 50.85, lng: 4.35 } });
  return { org, site };
}

type Opts = {
  role?: "DRIVER" | "PASSENGER" | "EITHER";
  seats?: number;
  days?: number[];
  arriveBy?: string;
  r1?: string;
  costMode?: "CONTRIBUTE" | "ALTERNATE" | "EITHER";
};

export async function makeUser(orgId: string, siteId: string, email: string, home: LatLng, opts: Opts = {}) {
  const user = await db.user.create({
    data: {
      orgId,
      email,
      name: email.split("@")[0],
      homeLat: home.lat,
      homeLng: home.lng,
      homeAddress: "x",
      onboardingStep: 8,
      onboardingCompletedAt: new Date(),
      profile: {
        create: {
          rideRole: opts.role ?? "EITHER",
          seatsAvailable: opts.seats ?? (opts.role === "PASSENGER" ? 0 : 3),
          maxDetourMin: 15,
          maxExtraRideMin: 20,
          languages: "nl",
          costMode: opts.costMode ?? "EITHER",
        },
      },
      scheduleEntries: {
        create: (opts.days ?? [1, 2, 3, 4, 5]).map((weekday) => ({ weekday, siteId, arriveBy: opts.arriveBy ?? "08:15", arriveFlexMin: 15, departEarliest: "16:30", departFlexMin: 30 })),
      },
      consents: { create: [{ scope: "LOCATION_SHARING", policyVersion: "1" }, { scope: "PILOT_RESEARCH", policyVersion: "1" }] },
      surveyResponses: { create: { surveyKey: "ONBOARDING", answers: JSON.stringify({ r1: opts.r1 ?? "CAR_ALONE", r2: 20, r3: "50_100", r4: "NEVER", r5: "MONEY", r6: "SCHEDULES", r7: 4, r8: "YES", r9: "NO", r10: "" }) } },
    },
  });
  const a = approximateLocation(home, user.id);
  return db.user.update({ where: { id: user.id }, data: { approxLat: a.lat, approxLng: a.lng } });
}

export async function makePool(orgId: string, siteId: string, driverId: string, passengerIds: string[], direction = "AM", days = "1,2,3,4,5") {
  return db.pool.create({
    data: {
      orgId,
      siteId,
      direction,
      name: "Test pool",
      status: "ACTIVE",
      members: {
        create: [
          { userId: driverId, memberRole: "DRIVER", days, stopOrder: 0 },
          ...passengerIds.map((id, i) => ({ userId: id, memberRole: "PASSENGER", days, stopOrder: i + 1 })),
        ],
      },
    },
  });
}
