import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isDevConvenienceEnabled } from "@/lib/env";
import { jobDigest, jobNightly, jobVerification } from "@/lib/jobs";

export const dynamic = "force-dynamic";

// /dev/jobs?run=digest|verification|nightly[&now=ISO] — run a scheduled job by hand.
export async function GET(req: Request) {
  if (!isDevConvenienceEnabled()) return new NextResponse(null, { status: 404 });
  const sp = new URL(req.url).searchParams;
  const run = sp.get("run");
  const now = sp.get("now") ? new Date(sp.get("now")!) : new Date();
  const orgs = await db.organisation.findMany({ select: { id: true } });
  const out = [];
  for (const o of orgs) {
    if (run === "digest") out.push(await jobDigest(o.id, now));
    else if (run === "verification") out.push(await jobVerification(o.id, now));
    else if (run === "nightly") out.push(await jobNightly(o.id));
  }
  return NextResponse.json(out);
}
