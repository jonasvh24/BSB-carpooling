import { destination, haversineM, type LatLng } from "../../geo/haversine";
import type { EngineProfile, EngineSchedule, EngineUser, Router, Weekday } from "../types";

export const SITE: LatLng = { lat: 50.85, lng: 4.35 };
export const site = { id: "site-1", location: SITE };

// Km north then km east of the site. Along a meridian haversine is exact, so
// hand calculations in the tests use these distances directly.
export function at(kmNorth: number, kmEast = 0): LatLng {
  const p = destination(SITE, 0, kmNorth * 1000);
  return kmEast ? destination(p, 90, kmEast * 1000) : p;
}

// Deterministic stub router: straight line at 30 km/h (2 min per km), no detour factor.
export const stubRouter: Router = async (points) => {
  const legs = [];
  for (let i = 1; i < points.length; i++) {
    const distanceM = haversineM(points[i - 1], points[i]);
    legs.push({ distanceM, durationS: (distanceM / 1000 / 30) * 3600 });
  }
  return {
    distanceM: legs.reduce((a, l) => a + l.distanceM, 0),
    durationS: legs.reduce((a, l) => a + l.durationS, 0),
    legs,
    estimated: false,
  };
};

export const throwingRouter: Router = async () => {
  throw new Error("OSRM down");
};

export function schedule(days: Weekday[], over: Partial<EngineSchedule> = {}): Partial<Record<Weekday, EngineSchedule>> {
  const out: Partial<Record<Weekday, EngineSchedule>> = {};
  for (const d of days) {
    out[d] = {
      siteId: "site-1",
      arriveBy: "08:15",
      arriveFlexMin: 15,
      departEarliest: "16:30",
      departFlexMin: 30,
      wantsAm: true,
      wantsPm: true,
      ...over,
    };
  }
  return out;
}

export const baseProfile: EngineProfile = {
  rideRole: "EITHER",
  preferDriving: false,
  directions: "BOTH",
  seatsAvailable: 3,
  maxDetourMin: 10,
  pickupStyle: "DOOR",
  maxWalkM: 250,
  maxExtraRideMin: 15,
  smoking: "NO",
  talk: "ANY",
  music: "ANY",
  genderPref: "ANY",
  languages: ["nl"],
  costMode: "EITHER",
};

export function user(
  id: string,
  home: LatLng,
  profile: Partial<EngineProfile> = {},
  sched: Partial<Record<Weekday, EngineSchedule>> = schedule([1, 2, 3, 4, 5]),
  extra: Partial<EngineUser> = {},
): EngineUser {
  return {
    id,
    home,
    gender: null,
    profile: { ...baseProfile, ...profile },
    schedule: sched,
    plannedTrips: 0,
    doneTrips: 0,
    seatsUsed: {},
    ...extra,
  };
}

export const driver = (id: string, home: LatLng, profile: Partial<EngineProfile> = {}, sched?: Partial<Record<Weekday, EngineSchedule>>, extra?: Partial<EngineUser>) =>
  user(id, home, { rideRole: "DRIVER", ...profile }, sched, extra);
export const passenger = (id: string, home: LatLng, profile: Partial<EngineProfile> = {}, sched?: Partial<Record<Weekday, EngineSchedule>>, extra?: Partial<EngineUser>) =>
  user(id, home, { rideRole: "PASSENGER", seatsAvailable: 0, ...profile }, sched, extra);

export function ctx(users: EngineUser[], router: Router = stubRouter) {
  return { site, users, router, blockedPairs: new Set<string>(), convertedPairs: new Set<string>() };
}
