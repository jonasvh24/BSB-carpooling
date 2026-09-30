import { testDb as db } from "./db";
import { approximateLocation } from "../src/lib/geo/approx";
import { destination } from "../src/lib/geo/haversine";

const SITE = { lat: 50.8467, lng: 4.3525 };
export const at = (kmNorth: number, kmEast = 0) => {
  const p = destination(SITE, 0, kmNorth * 1000);
  return kmEast ? destination(p, 90, kmEast * 1000) : p;
};

// A fully onboarded user, created directly in the e2e database.
export async function makeOnboardedUser(email: string, home: { lat: number; lng: number }, role: "DRIVER" | "PASSENGER" | "EITHER") {
  const org = await db.organisation.findFirstOrThrow();
  const site = await db.site.findFirstOrThrow({ where: { orgId: org.id } });
  await db.user.deleteMany({ where: { email } });
  const user = await db.user.create({
    data: {
      orgId: org.id,
      email,
      name: email.split("@")[0].replace(".", " "),
      phone: "+32 470 00 00 00",
      homeLat: home.lat,
      homeLng: home.lng,
      homeAddress: "Test street 1",
      onboardingStep: 8,
      onboardingCompletedAt: new Date(),
      profile: { create: { rideRole: role, seatsAvailable: role === "PASSENGER" ? 0 : 3, maxDetourMin: 15, languages: "nl", vehicleDesc: role === "PASSENGER" ? null : "Grey Skoda" } },
      scheduleEntries: { create: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, siteId: site.id, arriveBy: "08:15", arriveFlexMin: 15, departEarliest: "16:30", departFlexMin: 30 })) },
      consents: { create: [{ scope: "LOCATION_SHARING", policyVersion: org.policyVersion }, { scope: "PILOT_RESEARCH", policyVersion: org.policyVersion }] },
      surveyResponses: { create: { surveyKey: "ONBOARDING", answers: JSON.stringify({ r1: "CAR_ALONE", r2: 20, r3: "50_100", r4: "NEVER", r5: "MONEY", r6: "SCHEDULES", r7: 4, r8: "YES", r9: "NO", r10: "" }) } },
    },
  });
  const a = approximateLocation(home, user.id);
  return db.user.update({ where: { id: user.id }, data: { approxLat: a.lat, approxLng: a.lng } });
}
