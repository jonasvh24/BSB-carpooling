import cron from "node-cron";
import { db } from "../db";
import { jobDigest, jobMorningFlush, jobNightly, jobVerification, jobWeeklyJoined } from "./index";

// In-process node-cron; fine for a single-process pilot (brief §2.2).
// Times are in each organisation's timezone; the digest hour is admin-settable.
const g = globalThis as unknown as { schedulerStarted?: boolean };

export async function startScheduler() {
  if (g.schedulerStarted) return;
  g.schedulerStarted = true;
  const orgs = await db.organisation.findMany({ select: { id: true, timezone: true, digestTime: true } });
  for (const org of orgs) {
    const [h, m] = org.digestTime.split(":").map(Number);
    const tz = org.timezone;
    const run = (name: string, fn: () => Promise<unknown>) => () =>
      fn().then((r) => console.log(`[cron] ${name}`, r)).catch((e) => console.error(`[cron] ${name} failed`, e));
    cron.schedule(`${m} ${h} * * *`, run("digest", () => jobDigest(org.id)), { timezone: tz });
    cron.schedule("0 20 * * *", run("verification", () => jobVerification(org.id)), { timezone: tz });
    cron.schedule("0 2 * * *", run("nightly", () => jobNightly(org.id)), { timezone: tz });
    cron.schedule("0 7 * * *", run("morning-flush", () => jobMorningFlush()), { timezone: tz });
    cron.schedule("0 9 * * 1", run("weekly-joined", () => jobWeeklyJoined(org.id)), { timezone: tz });
  }
  console.log(`[cron] scheduler started for ${orgs.length} organisation(s)`);
}
