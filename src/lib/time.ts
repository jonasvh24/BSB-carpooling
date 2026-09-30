import { addDays, formatISO, getISOWeek, getISOWeekYear, parseISO } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

// Schedules are local "HH:mm"; dates are "YYYY-MM-DD"; the organisation timezone
// decides what "today" and "18:00" mean. All arithmetic on times is in minutes.

export function hmToMin(hm: string): number {
  const [h, m] = hm.split(":").map((x) => Number.parseInt(x, 10));
  if (!Number.isInteger(h) || !Number.isInteger(m)) throw new Error(`Bad time ${hm}`);
  return h * 60 + m;
}

export function minToHm(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayInZone(tz: string, now = new Date()): string {
  return formatInTimeZone(now, tz, "yyyy-MM-dd");
}

export function nowHmInZone(tz: string, now = new Date()): string {
  return formatInTimeZone(now, tz, "HH:mm");
}

export function addDaysIso(date: string, n: number): string {
  return formatISO(addDays(parseISO(date), n), { representation: "date" });
}

// ISO weekday 1 = Monday ... 7 = Sunday for a YYYY-MM-DD date.
export function isoWeekday(date: string): number {
  const d = parseISO(date).getDay();
  return d === 0 ? 7 : d;
}

export function isoWeekKey(date: string): string {
  const d = parseISO(date);
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`;
}

// Next business day after `date` (Mon–Fri), skipping non-working days.
export function nextBusinessDay(date: string, nonWorking: Set<string>): string {
  let d = addDaysIso(date, 1);
  for (let i = 0; i < 30; i++) {
    const wd = isoWeekday(d);
    if (wd <= 5 && !nonWorking.has(d)) return d;
    d = addDaysIso(d, 1);
  }
  return d;
}

export function zonedHour(tz: string, now = new Date()): number {
  return toZonedTime(now, tz).getHours();
}

export function formatDateLong(date: string, tz: string): string {
  return formatInTimeZone(parseISO(date), tz, "EEE d MMM");
}
