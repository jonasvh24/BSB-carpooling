import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { randomInt } from "node:crypto";
import { audit } from "@/lib/admin/audit";
import { MIN_GROUP } from "@/lib/admin/metrics";

// Every survey shares one header so rows of different surveys line up.
const SURVEY_COLUMNS = Object.fromEntries(["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "recommend", "worked", "didnt", "oneChange", "keep", "pay", "tripsSoFar"].map((k) => [k, ""]));

function shuffle<T>(xs: T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// CSV exports (§8.2): users (minimal), matches, trips, survey. Opens in a spreadsheet.
function csv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

// What the school's administrators may take away is deliberately thin: who has
// an account, and numbers. No home areas, no pairings, no per-person trips, no
// answers that can be traced to a person (docs/legal/COMPLIANCE_REGISTER.md E1, S3).
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") return new NextResponse(null, { status: 403 });
  const { kind } = await ctx.params;
  const orgId = admin.orgId;
  let rows: Array<Record<string, unknown>> = [];
  if (kind === "users") {
    const users = await db.user.findMany({ where: { orgId }, orderBy: { email: "asc" } });
    rows = users.map((u) => ({ email: u.email, name: u.name, role: u.role, status: u.status, onboarded: u.onboardingCompletedAt ? "yes" : "no", joined: u.createdAt.toISOString().slice(0, 10), isSeed: u.isSeed }));
  } else if (kind === "matches") {
    // One row per suggested pair, without the people.
    const matches = await db.match.findMany({ where: { orgId }, orderBy: [{ score: "desc" }, { detourMinAvg: "asc" }] });
    rows = matches.map((m) => ({ direction: m.direction, score: m.score, sharedDays: m.sharedDays.split(",").filter(Boolean).length, detourMinAvg: m.detourMinAvg, detourMinMax: m.detourMinMax, status: m.status.startsWith("DISMISSED") ? "DISMISSED" : m.status }));
  } else if (kind === "trips") {
    const trips = await db.trip.findMany({ where: { pool: { orgId } }, include: { participants: true }, orderBy: { date: "asc" } });
    // Pools are numbered per export; their names contain the driver's name.
    const poolNo = new Map<string, number>();
    rows = trips.map((tr) => {
      if (!poolNo.has(tr.poolId)) poolNo.set(tr.poolId, poolNo.size + 1);
      return { pool: poolNo.get(tr.poolId), date: tr.date, direction: tr.direction, status: tr.status, verified: tr.verified, distanceM: tr.distanceM ?? "", kmSaved: tr.kmSaved ?? "", participantsIn: tr.participants.filter((p) => p.status === "IN").length, noShows: tr.participants.filter((p) => p.status === "NO_SHOW").length };
    });
  } else if (kind === "survey") {
    // Only answers given under an open research consent, only for surveys with at
    // least MIN_GROUP of them, no respondent number, no timestamp, shuffled.
    const responses = await db.surveyResponse.findMany({ where: { user: { orgId, consents: { some: { scope: "PILOT_RESEARCH", withdrawnAt: null } } } } });
    const bySurvey = new Map<string, typeof responses>();
    for (const r of responses) bySurvey.set(r.surveyKey, [...(bySurvey.get(r.surveyKey) ?? []), r]);
    const kept = [...bySurvey.values()].filter((group) => group.length >= MIN_GROUP).flat();
    rows = shuffle(kept).map((r) => ({ survey: r.surveyKey, ...SURVEY_COLUMNS, ...(JSON.parse(r.answers) as Record<string, unknown>) }));
  } else return new NextResponse(null, { status: 404 });
  await audit(admin.orgId, admin.id, "EXPORT", "Organisation", orgId, { kind, rows: rows.length });
  return new NextResponse(csv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
