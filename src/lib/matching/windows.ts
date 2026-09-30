import { hmToMin } from "../time";
import { ARRIVAL_BUFFER_MIN, GATHER_BUFFER_MIN, type Direction, type EngineSchedule } from "./types";

export type Window = { lo: number; hi: number };

// §6.4. AM: [arriveBy − flex, arriveBy] at the site. PM: [departEarliest, departEarliest + flex].
export function windowFor(s: EngineSchedule, direction: Direction): Window {
  if (direction === "AM") {
    const hi = hmToMin(s.arriveBy);
    return { lo: hi - s.arriveFlexMin, hi };
  }
  const lo = hmToMin(s.departEarliest);
  return { lo, hi: lo + s.departFlexMin };
}

export function intersect(windows: Window[]): Window | null {
  const lo = Math.max(...windows.map((w) => w.lo));
  const hi = Math.min(...windows.map((w) => w.hi));
  return lo <= hi ? { lo, hi } : null;
}

// AM target arrival: late edge minus five minutes to park and walk in, never
// earlier than the window opens. PM: leave five minutes after the earliest
// everyone can, to gather up.
export function siteTime(common: Window, direction: Direction): number {
  return direction === "AM" ? Math.max(common.lo, common.hi - ARRIVAL_BUFFER_MIN) : common.lo + GATHER_BUFFER_MIN;
}

// The reference time used by the time score (§6.5): arriveBy for AM, departEarliest for PM.
export function referenceMin(s: EngineSchedule, direction: Direction): number {
  return hmToMin(direction === "AM" ? s.arriveBy : s.departEarliest);
}
