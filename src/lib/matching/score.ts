import { RELIABILITY_DEFAULT, RELIABILITY_MIN_TRIPS, type EngineProfile, type EngineUser } from "./types";

const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

export function detourScore(detourMin: number, maxDetourMin: number): number {
  return maxDetourMin <= 0 ? 0 : clamp(1 - detourMin / maxDetourMin);
}

export function timeScore(refDriverMin: number, refPassengerMin: number): number {
  return clamp(1 - Math.abs(refDriverMin - refPassengerMin) / 45);
}

export function daysScore(shared: number, daysDriver: number, daysPassenger: number): number {
  const denom = Math.max(daysDriver, daysPassenger);
  return denom === 0 ? 0 : shared / denom;
}

export function softConflicts(a: EngineProfile, b: EngineProfile): number {
  let n = 0;
  if ((a.talk === "QUIET" && b.talk === "CHATTY") || (a.talk === "CHATTY" && b.talk === "QUIET")) n++;
  const la = a.languages.filter((l) => l !== "other");
  const lb = b.languages.filter((l) => l !== "other");
  if (la.length && lb.length && !la.some((l) => lb.includes(l))) n++;
  return n;
}

export function prefScore(a: EngineProfile, b: EngineProfile): number {
  return clamp(1 - 0.5 * softConflicts(a, b));
}

export function reliabilityOf(u: Pick<EngineUser, "plannedTrips" | "doneTrips">): number {
  if (u.plannedTrips < RELIABILITY_MIN_TRIPS) return RELIABILITY_DEFAULT;
  return clamp(u.doneTrips / u.plannedTrips);
}

export function reliabilityScore(a: EngineUser, b: EngineUser): number {
  return Math.min(reliabilityOf(a), reliabilityOf(b));
}

export function combine(parts: { detour: number; time: number; days: number; pref: number; reliability: number }): number {
  return Math.round(
    100 * (0.4 * parts.detour + 0.25 * parts.time + 0.15 * parts.days + 0.1 * parts.pref + 0.1 * parts.reliability),
  );
}
