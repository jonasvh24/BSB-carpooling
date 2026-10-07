import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { jobDigest, jobMorningFlush, jobNightly, jobVerification, jobWeeklyJoined } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Serverless hosts have no long-running process for node-cron, so the scheduled
// jobs are triggered over HTTP by Netlify scheduled functions (see netlify/functions).
// Protected by JOBS_SECRET; a 404 when it is unset, so nothing is exposed by default.
export async function POST(req: Request) {
  if (!env.JOBS_SECRET) return new NextResponse(null, { status: 404 });
  const given = req.headers.get("x-jobs-secret") ?? "";
  const a = Buffer.from(given), b = Buffer.from(env.JOBS_SECRET);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return new NextResponse(null, { status: 401 });
  const run = new URL(req.url).searchParams.get("run");
  const orgs = await db.organisation.findMany({ select: { id: true } });
  const out: unknown[] = [];
  if (run === "morning-flush") out.push(await jobMorningFlush());
  for (const o of orgs) {
    if (run === "digest") out.push(await jobDigest(o.id));
    else if (run === "verification") out.push(await jobVerification(o.id));
    else if (run === "nightly") out.push(await jobNightly(o.id));
    else if (run === "weekly-joined") out.push(await jobWeeklyJoined(o.id));
  }
  return NextResponse.json({ run, out });
}
