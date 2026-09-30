import type { LatLng } from "../geo/haversine";

// Plain-object inputs for the engine. No Prisma types here on purpose: the
// engine must stay testable with fixtures and free of database concerns.

export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Direction = "AM" | "PM";

export type EngineSchedule = {
  siteId: string;
  arriveBy: string; // "HH:mm"
  arriveFlexMin: number;
  departEarliest: string; // "HH:mm"
  departFlexMin: number;
  wantsAm: boolean;
  wantsPm: boolean;
};

export type EngineProfile = {
  rideRole: "DRIVER" | "PASSENGER" | "EITHER";
  preferDriving: boolean;
  directions: "AM" | "PM" | "BOTH";
  seatsAvailable: number;
  maxDetourMin: number;
  pickupStyle: "DOOR" | "MEETING_POINT";
  maxWalkM: number;
  maxExtraRideMin: number;
  smoking: "NO" | "YES" | "ANY";
  talk: "QUIET" | "CHATTY" | "ANY";
  music: "ANY" | "NONE" | "DRIVER_CHOICE";
  genderPref: "ANY" | "SAME";
  languages: string[];
  costMode: "CONTRIBUTE" | "ALTERNATE" | "EITHER";
};

export type EngineUser = {
  id: string;
  name?: string;
  home: LatLng;
  gender: string | null;
  profile: EngineProfile;
  schedule: Partial<Record<Weekday, EngineSchedule>>;
  // Trip history for the reliability score.
  plannedTrips: number;
  doneTrips: number;
  // Seats already taken in this driver's pool per weekday and direction.
  seatsUsed: Partial<Record<Direction, Partial<Record<Weekday, number>>>>;
};

export type EngineSite = { id: string; location: LatLng };

export type RouteLeg = { durationS: number; distanceM: number };
export type RouteResult = { durationS: number; distanceM: number; legs: RouteLeg[]; estimated: boolean };
export type Router = (points: LatLng[]) => Promise<RouteResult>;

export type EngineContext = {
  site: EngineSite;
  users: EngineUser[];
  router: Router;
  // "a|b" pairs, either order, that must never match.
  blockedPairs: Set<string>;
  // "driverId|passengerId|direction" already converted into a pool.
  convertedPairs: Set<string>;
  // Only compute pairs involving these users (per-user recompute). Undefined = all.
  onlyUserIds?: Set<string>;
};

export type Reason = { code: ReasonCode; params?: Record<string, string | number> };
export type ReasonCode =
  | "detour"
  | "detourNone"
  | "bothAtSchool"
  | "bothLeave"
  | "pickupDoor"
  | "pickupMeeting"
  | "dropOff"
  | "quiet"
  | "chatty"
  | "rotation"
  | "noHistory"
  | "reliable"
  | "language"
  | "everyDay"
  | "estimated";

export type DayDetail = {
  pickupTime: string; // AM: pickup at passenger; PM: drop-off at passenger
  siteTime: string; // AM: arrival at site; PM: departure from site
  driverLeaves: string; // AM: driver leaves home; PM: same as siteTime
  detourMin: number;
  extraRideMin: number;
  score: number;
};

export type MatchCandidate = {
  siteId: string;
  driverId: string;
  passengerId: string;
  direction: Direction;
  score: number;
  sharedDays: Weekday[];
  detourMinAvg: number;
  detourMinMax: number;
  extraRideMinAvg: number;
  details: {
    days: Partial<Record<Weekday, DayDetail>>;
    reasons: Reason[];
    estimated: boolean;
    rotation: boolean;
  };
};

// Why a user ended up without any match, by the furthest stage any candidate reached (§8.2).
export type UnmatchedReason = "NO_SCHEDULE" | "NO_DRIVERS" | "NO_CANDIDATE_IN_CORRIDOR" | "TIME_MISMATCH" | "CAPACITY";

export type EngineOutput = {
  matches: MatchCandidate[];
  diagnostics: Map<string, UnmatchedReason>;
  routeCalls: number;
};

export const DWELL_MIN = 2;
export const ARRIVAL_BUFFER_MIN = 5;
export const GATHER_BUFFER_MIN = 5;
export const CORRIDOR_KM_PER_DETOUR_MIN = 0.7;
export const CORRIDOR_MAX_CANDIDATES = 30;
export const MIN_DISPLAY_SCORE = 40;
export const RELIABILITY_MIN_TRIPS = 5;
export const RELIABILITY_DEFAULT = 0.7;
