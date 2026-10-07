import { db } from "../db";
import { recomputeOrg } from "../matching-service";
import { expireRequests } from "../pools/service";
import { autoCloseTrips, materialiseTomorrow, sendDigest, sendVerificationPrompts } from "../pools/daily";
import { flushQuietHoursEmail, notify } from "../notify";
import { runRetention } from "../retention";
import { todayInZone } from "../time";
import { haversineKm } from "../geo/haversine";
import { t, fmt } from "@/i18n";

// Each job is a plain async function so the scheduler, the admin buttons and the
// tests all call the same code.

export async function jobDigest(orgId: string, now = new Date()) {
  const { date, created } = await materialiseTomorrow(orgId, now);
  const sent = await sendDigest(orgId, date);
  return { date, created, sent };
}

export async function jobVerification(orgId: string, now = new Date()) {
  const org = await db.organisation.findUniqueOrThrow({ where: { id: orgId } });
  const date = todayInZone(org.timezone, now);
  return { date, sent: await sendVerificationPrompts(orgId, date) };
}

export async function jobNightly(orgId: string) {
  const expired = await expireRequests();
  const closed = await autoCloseTrips();
  const retention = await runRetention();
  const recompute = await recomputeOrg(orgId);
  return { expired, closed, retention, recompute: { matches: recompute.matches, ms: recompute.ms } };
}

export async function jobMorningFlush() {
  await flushQuietHoursEmail();
}

// Weekly "N colleagues joined near you" for users with an 8 km neighbour who signed up this week.
export async function jobWeeklyJoined(orgId: string) {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const users = await db.user.findMany({ where: { orgId, status: "ACTIVE", homeLat: { not: null }, homeLng: { not: null } }, select: { id: true, homeLat: true, homeLng: true, createdAt: true, onboardingCompletedAt: true } });
  const fresh = users.filter((u) => u.createdAt >= since && u.onboardingCompletedAt);
  let sent = 0;
  for (const u of users) {
    if (!u.onboardingCompletedAt) continue;
    const n = fresh.filter((f) => f.id !== u.id && haversineKm({ lat: u.homeLat!, lng: u.homeLng! }, { lat: f.homeLat!, lng: f.homeLng! }) <= 8).length;
    if (n === 0) continue;
    await notify(u.id, "WEEKLY_JOINED", { title: fmt(t.notifications.weeklyTitle, { n }), body: t.notifications.weeklyBody, link: "/matches" });
    sent++;
  }
  return sent;
}

// On demand when the app is opened (§7.4): tomorrow's trips exist, throttled per process.
let lastEnsure = 0;
export async function ensureTomorrowTrips(orgId: string) {
  if (Date.now() - lastEnsure < 10 * 60 * 1000) return;
  lastEnsure = Date.now();
  try {
    await materialiseTomorrow(orgId);
  } catch (err) {
    console.warn(`[jobs] ensureTomorrowTrips failed: ${(err as Error).message}`);
  }
}
