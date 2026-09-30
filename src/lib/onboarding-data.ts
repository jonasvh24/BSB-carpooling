import { db } from "./db";
import { parseList } from "./enums";
import type { CurrentUser } from "./session";
import type { DayEntry } from "@/components/onboarding/days-form";

// Everything the wizard forms need, shaped for their `initial` props. Shared by
// /onboarding, /profile and /schedule so the same components edit the same data.
export async function loadOnboardingData(user: CurrentUser) {
  const [profile, entries, sites, survey] = await Promise.all([
    db.commuteProfile.findUnique({ where: { userId: user.id } }),
    db.scheduleEntry.findMany({ where: { userId: user.id }, orderBy: { weekday: "asc" } }),
    db.site.findMany({ where: { orgId: user.orgId, active: true }, orderBy: { name: "asc" } }),
    db.surveyResponse.findFirst({ where: { userId: user.id, surveyKey: "ONBOARDING" }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    about: { name: user.name, phone: user.phone ?? "", photoUrl: user.photoUrl, languages: parseList(profile?.languages) },
    home: { homeAddress: user.homeAddress ?? "", homeLat: user.homeLat, homeLng: user.homeLng },
    siteCentre: sites[0] ? { lat: sites[0].lat, lng: sites[0].lng } : { lat: 50.85, lng: 4.35 },
    sites: sites.map((s) => ({ id: s.id, name: s.name, defaultArriveBy: s.defaultArriveBy, defaultDepartEarliest: s.defaultDepartEarliest })),
    days: {
      directions: (profile?.directions ?? "BOTH") as "AM" | "PM" | "BOTH",
      entries: entries.map<DayEntry>((e) => ({
        weekday: e.weekday,
        siteId: e.siteId,
        arriveBy: e.arriveBy,
        arriveFlexMin: e.arriveFlexMin,
        departEarliest: e.departEarliest,
        departFlexMin: e.departFlexMin,
        wantsAm: e.wantsAm,
        wantsPm: e.wantsPm,
      })),
    },
    role: {
      rideRole: (profile?.rideRole ?? "EITHER") as "DRIVER" | "PASSENGER" | "EITHER",
      preferDriving: profile?.preferDriving ?? false,
      vehicleDesc: profile?.vehicleDesc ?? "",
      seatsAvailable: profile?.seatsAvailable ?? 1,
      maxDetourMin: profile?.maxDetourMin ?? 10,
      pickupStyle: (profile?.pickupStyle ?? "DOOR") as "DOOR" | "MEETING_POINT",
      maxWalkM: profile?.maxWalkM ?? 250,
      maxExtraRideMin: profile?.maxExtraRideMin ?? 15,
    },
    prefs: {
      smoking: profile?.smoking ?? "NO",
      talk: profile?.talk ?? "ANY",
      music: profile?.music ?? "ANY",
      genderPref: profile?.genderPref ?? "ANY",
      gender: user.gender ?? "",
      costMode: profile?.costMode ?? "EITHER",
      notes: profile?.notes ?? "",
    },
    research: (survey ? (JSON.parse(survey.answers) as Record<string, string | number>) : {}) as Record<string, string | number>,
  };
}
