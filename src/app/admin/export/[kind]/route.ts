import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { audit } from "@/lib/admin/audit";

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

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "ADMIN") return new NextResponse(null, { status: 403 });
  const { kind } = await ctx.params;
  const orgId = admin.orgId;
  let rows: Array<Record<string, unknown>> = [];
  if (kind === "users") {
    const users = await db.user.findMany({ where: { orgId }, include: { profile: true }, orderBy: { createdAt: "asc" } });
    rows = users.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, onboarded: u.onboardingCompletedAt?.toISOString() ?? "", rideRole: u.profile?.rideRole ?? "", seats: u.profile?.seatsAvailable ?? "", approxLat: u.approxLat ?? "", approxLng: u.approxLng ?? "", isSeed: u.isSeed, createdAt: u.createdAt.toISOString() }));
  } else if (kind === "matches") {
    const matches = await db.match.findMany({ where: { orgId }, orderBy: { score: "desc" } });
    rows = matches.map((m) => ({ driverId: m.driverId, passengerId: m.passengerId, direction: m.direction, score: m.score, sharedDays: m.sharedDays, detourMinAvg: m.detourMinAvg, detourMinMax: m.detourMinMax, status: m.status, computedAt: m.computedAt.toISOString() }));
  } else if (kind === "trips") {
    const trips = await db.trip.findMany({ where: { pool: { orgId } }, include: { participants: true, pool: true }, orderBy: { date: "asc" } });
    rows = trips.map((tr) => ({ id: tr.id, pool: tr.pool.name, date: tr.date, direction: tr.direction, driverId: tr.driverId ?? "", status: tr.status, verified: tr.verified, plannedDepart: tr.plannedDepart, distanceM: tr.distanceM ?? "", kmSaved: tr.kmSaved ?? "", participantsIn: tr.participants.filter((p) => p.status === "IN").length, noShows: tr.participants.filter((p) => p.status === "NO_SHOW").length }));
  } else if (kind === "survey") {
    const responses = await db.surveyResponse.findMany({ where: { user: { orgId } }, orderBy: { createdAt: "asc" } });
    // Aggregate-only in spirit: the user id is replaced by a per-export sequence number.
    const seq = new Map<string, number>();
    rows = responses.map((r) => {
      if (!seq.has(r.userId)) seq.set(r.userId, seq.size + 1);
      return { respondent: seq.get(r.userId), survey: r.surveyKey, createdAt: r.createdAt.toISOString(), ...(JSON.parse(r.answers) as Record<string, unknown>) };
    });
  } else return new NextResponse(null, { status: 404 });
  await audit(admin.id, "EXPORT", "Organisation", orgId, { kind, rows: rows.length });
  return new NextResponse(csv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
