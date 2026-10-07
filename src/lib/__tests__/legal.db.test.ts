import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { stubRouter } from "@/lib/matching/__tests__/fixtures";

// Tests written for the legal audit (docs/legal/COMPLIANCE_REGISTER.md). Each
// describe block names the register rows it is the evidence for.

vi.mock("@/lib/geo/provider", () => ({
  route: stubRouter,
  routeGeometry: async (points: { lat: number; lng: number }[]) => ({ ...(await stubRouter(points)), geometry: points.map((p) => [p.lat, p.lng]) }),
  geocode: async () => [],
  reverseGeocode: async () => "Stub address",
}));
const sent: Array<{ to: string; subject: string; text: string }> = [];
vi.mock("@/lib/mail", () => ({ sendMail: async (m: { to: string; subject: string; text: string }) => void sent.push(m), devMailbox: () => [] }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
const session: { user: unknown } = { user: null };
vi.mock("@/lib/session", () => ({
  getCurrentUser: async () => session.user,
  requireUser: async () => session.user,
  requireAdmin: async () => session.user,
  hasCurrentConsent: async () => true,
  touchLastActive: async () => {},
}));

import { db } from "@/lib/db";
import { at } from "@/lib/matching/__tests__/fixtures";
import { makeOrg, makePool, makeUser, resetDb } from "@/test/factory";
import { deleteUserCascade, exportUserData, EXPORT_EXCLUDED, withdrawResearch } from "@/lib/gdpr";
import { withdrawLocation } from "@/lib/consent";
import { RETENTION, runRetention } from "@/lib/retention";
import { scrubRoute } from "@/lib/pools/route-scrub";
import { ptKey } from "@/lib/geo/haversine";
import { recomputeOrg, loadEngineUsers } from "@/lib/matching-service";
import { loadMatchesFor, countNearbyIncomplete, COLD_START_MIN } from "@/lib/matches-data";
import { computeMetrics, heatCells, MIN_CELL, MIN_GROUP } from "@/lib/admin/metrics";
import { cappedRate, KM_RATE_CEILING_CENTS, monthlyTally } from "@/lib/pools/tally";
import { stripJpegBytes, stripJpegMetadata } from "@/lib/photo";
import { assertSafeSecret } from "@/lib/env";
import { buildCsp } from "@/lib/csp";
import { safeReturnTo, consentSchema, aboutSchema } from "@/lib/validation/onboarding";
import { approximateLocation, snapToCell, APPROX_CELL_M } from "@/lib/geo/approx";
import { haversineM } from "@/lib/geo/haversine";
import { renderEmail } from "@/lib/notify";
import { audit } from "@/lib/admin/audit";
import { t } from "@/i18n";

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const routeJson = (driverId: string, passengerId: string, home: { lat: number; lng: number }) =>
  JSON.stringify({ driverId, driverLeaves: "07:40", siteTime: "08:10", stops: [{ userId: passengerId, time: "07:50", label: null }], points: [home, { lat: 50.85, lng: 4.35 }], estimated: false });

let orgId: string;
let siteId: string;
let driverId: string;
let passengerId: string;
const passengerHome = at(5, 1);

async function base() {
  await resetDb();
  sent.length = 0;
  const { org, site } = await makeOrg();
  orgId = org.id;
  siteId = site.id;
  driverId = (await makeUser(orgId, siteId, "driver@example.org", at(10), { role: "DRIVER" })).id;
  passengerId = (await makeUser(orgId, siteId, "pass@example.org", passengerHome, { role: "PASSENGER" })).id;
}

describe("R1 export: every field, field by field", () => {
  beforeEach(base);

  it("covers every User column and every relation, or names the reason it is left out", async () => {
    await recomputeOrg(orgId);
    const pool = await makePool(orgId, siteId, driverId, [passengerId]);
    await db.user.update({ where: { id: passengerId }, data: { phone: "+32 470 11 22 33", gender: "FEMALE", homeAddress: "Teststraat 1", photoUrl: "data:image/jpeg;base64,AAAA" } });
    await db.message.create({ data: { poolId: pool.id, userId: passengerId, body: "See you at eight" } });
    await db.notification.create({ data: { userId: passengerId, kind: "NEW_MATCH", title: "New match", body: "b" } });
    await db.scheduleException.create({ data: { userId: passengerId, date: "2026-10-01", kind: "OFF", note: "dentist" } });
    await db.poolRequest.create({ data: { fromUserId: passengerId, toUserId: driverId, direction: "AM", days: "1", message: "hello" } });
    await db.report.create({ data: { reporterId: passengerId, reportedUserId: driverId, reason: "LATE" } });
    await db.block.create({ data: { blockerId: passengerId, blockedId: driverId } });
    await db.invitation.create({ data: { orgId, email: "pass@example.org" } });
    await db.trip.create({ data: { poolId: pool.id, date: "2026-09-21", direction: "AM", driverId, plannedDepart: "07:50", status: "DONE", participants: { create: [{ userId: driverId, status: "IN" }, { userId: passengerId, status: "IN" }] } } });
    await db.auditLog.create({ data: { actorId: passengerId, action: "TRIP_THUMBS_UP", targetType: "Trip", targetId: "x" } });

    const out = (await exportUserData(passengerId)) as Record<string, unknown>;
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === "User")!;
    for (const field of model.fields) {
      if (field.kind === "object" && EXPORT_EXCLUDED[field.name]) continue;
      expect(out, `User.${field.name} missing from the export`).toHaveProperty(field.name);
    }
    // Every excluded relation still exists in the schema (no stale exclusions).
    for (const name of Object.keys(EXPORT_EXCLUDED)) expect(model.fields.some((f) => f.name === name), name).toBe(true);

    expect(out.phone).toBe("+32 470 11 22 33");
    expect(out.homeAddress).toBe("Teststraat 1");
    expect(out.gender).toBe("FEMALE");
    expect((out.messages as unknown[]).length).toBe(1);
    expect((out.notifications as unknown[]).length).toBe(1);
    expect((out.surveyResponses as unknown[]).length).toBe(1);
    expect((out.consents as unknown[]).length).toBe(2);
    expect((out.tripParticipations as unknown[]).length).toBe(1);
    expect((out.scheduleEntries as unknown[]).length).toBe(5);
    expect((out.scheduleExceptions as unknown[]).length).toBe(1);
    expect((out.requestsSent as unknown[]).length).toBe(1);
    expect((out.reportsMade as unknown[]).length).toBe(1);
    expect((out.blocksMade as unknown[]).length).toBe(1);
    expect((out.poolMemberships as unknown[]).length).toBe(1);
    expect((out.matchesAsPassenger as unknown[]).length).toBeGreaterThan(0);
    expect(out.invitation).toMatchObject({ email: "pass@example.org" });
    expect((out.activity as unknown[]).length).toBe(1);
    // The driver's export lists the trip they drove.
    const d = (await exportUserData(driverId)) as Record<string, unknown>;
    expect((d.tripsDriven as unknown[]).length).toBe(1);
    // Nothing about other people beyond ids: the driver's phone is not in the passenger's file.
    await db.user.update({ where: { id: driverId }, data: { phone: "+32 499 99 99 99" } });
    expect(JSON.stringify(await exportUserData(passengerId))).not.toContain("+32 499 99 99 99");
  });
});

describe("R2 erasure reaches every storage location", () => {
  beforeEach(base);

  it("removes cached lookups, stored routes, invitations, tokens, names in pool titles, and leaves no derivable placeholder", async () => {
    const pool = await makePool(orgId, siteId, driverId, [passengerId]);
    const pt = ptKey(passengerHome);
    await db.geoCache.createMany({
      data: [
        { key: `REVERSE:${pt}`, kind: "REVERSE", value: '"Teststraat 1"' },
        { key: `ROUTE:${pt};50.8500,4.3500`, kind: "ROUTE", value: "{}" },
        { key: `ROUTE:${ptKey(at(10))};${pt};50.8500,4.3500`, kind: "ROUTE", value: "{}" },
        { key: `ROUTE:${ptKey(at(10))};50.8500,4.3500`, kind: "ROUTE", value: "{}" },
      ],
    });
    await db.invitation.create({ data: { orgId, email: "pass@example.org", usedAt: new Date() } });
    await db.verificationToken.create({ data: { identifier: "pass@example.org", token: "tok", expires: new Date(Date.now() + 1000) } });
    await db.message.create({ data: { poolId: pool.id, userId: passengerId, body: "hi" } });
    await db.notification.create({ data: { userId: passengerId, kind: "NEW_MATCH", title: "t", body: "b" } });
    const trip = await db.trip.create({
      data: { poolId: pool.id, date: "2026-09-21", direction: "AM", driverId, plannedDepart: "07:40", status: "DONE", plannedRoute: routeJson(driverId, passengerId, passengerHome), participants: { create: [{ userId: driverId, status: "IN" }, { userId: passengerId, status: "IN" }] } },
    });

    await deleteUserCascade(passengerId);

    expect(await db.user.findUnique({ where: { id: passengerId } })).toBeNull();
    // GeoCache: every row that names the home is gone; the driver's own route stays.
    expect(await db.geoCache.count({ where: { key: { contains: pt } } })).toBe(0);
    expect(await db.geoCache.count()).toBe(1);
    expect(await db.invitation.count()).toBe(0);
    expect(await db.verificationToken.count()).toBe(0);
    expect(await db.message.count()).toBe(0);
    expect(await db.notification.count({ where: { userId: passengerId } })).toBe(0);
    // Stored route: no coordinates, no user id.
    const after = await db.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { participants: true } });
    expect(after.plannedRoute).not.toContain(passengerId);
    expect(after.plannedRoute).not.toContain('"lat"');
    expect(JSON.parse(after.plannedRoute!).stops[0].time).toBe("07:50");
    // Anonymised participant: random placeholder, not computable from the old id.
    const anon = after.participants.find((p) => p.userId === null)!;
    expect(anon.anonymisedId).toMatch(/^deleted-/);
    expect(anon.anonymisedId).not.toContain(createHash("sha256").update(passengerId).digest("hex").slice(0, 12));
    // Nowhere in the database does the id survive outside the audit log.
    expect(await db.match.count({ where: { OR: [{ driverId: passengerId }, { passengerId }] } })).toBe(0);
  });

  it("renames the pools a deleted driver drove and clears their id from stored routes", async () => {
    const pool = await db.pool.create({ data: { orgId, siteId, direction: "AM", name: "Morning carpool with driver", members: { create: [{ userId: driverId, memberRole: "DRIVER", days: "1" }, { userId: passengerId, memberRole: "PASSENGER", days: "1" }] } } });
    const trip = await db.trip.create({ data: { poolId: pool.id, date: "2026-09-21", direction: "AM", driverId, plannedDepart: "07:40", status: "DONE", plannedRoute: routeJson(driverId, passengerId, passengerHome) } });
    await deleteUserCascade(driverId);
    const p = await db.pool.findUniqueOrThrow({ where: { id: pool.id } });
    expect(p.name).toBe("Morning carpool (ended)");
    expect(p.status).toBe("ENDED");
    expect((await db.trip.findUniqueOrThrow({ where: { id: trip.id } })).plannedRoute).not.toContain(driverId);
  });

  it("scrubRoute drops points, swaps ids and survives bad input", () => {
    const out = JSON.parse(scrubRoute(routeJson("d", "p", { lat: 1, lng: 2 }), { p: "gone" })!);
    expect(out.points).toEqual([]);
    expect(out.stops[0].userId).toBe("gone");
    expect(out.driverId).toBe("d");
    expect(scrubRoute("not json", {})).toBeNull();
    expect(scrubRoute(null, {})).toBeNull();
  });
});

describe("X8 / E3 retention job", () => {
  beforeEach(base);

  it("purges each category at its period and keeps what is younger", async () => {
    const old = (days: number) => daysAgo(days + 1);
    const pool = await makePool(orgId, siteId, driverId, [passengerId]);
    const ended = await db.pool.create({ data: { orgId, siteId, direction: "PM", name: "old", status: "ENDED", endedAt: old(RETENTION.endedPoolChatDays) } });
    await db.geoCache.createMany({
      data: [
        { key: "GEOCODE:teststraat 1|", kind: "GEOCODE", value: "[]", createdAt: old(RETENTION.geocodeCacheDays) },
        { key: "GEOCODE:fresh|", kind: "GEOCODE", value: "[]" },
        { key: "REVERSE:1.0000,2.0000", kind: "REVERSE", value: '""', createdAt: old(RETENTION.geocodeCacheDays) },
        { key: "ROUTE:old", kind: "ROUTE", value: "{}", createdAt: old(RETENTION.routeCacheDays) },
        { key: "ROUTE:recent", kind: "ROUTE", value: "{}", createdAt: old(RETENTION.geocodeCacheDays) },
      ],
    });
    await db.notification.createMany({ data: [{ userId: passengerId, kind: "NEW_MATCH", title: "old", body: "", createdAt: old(RETENTION.notificationDays) }, { userId: passengerId, kind: "NEW_MATCH", title: "new", body: "" }] });
    await db.poolRequest.createMany({
      data: [
        { fromUserId: passengerId, toUserId: driverId, direction: "AM", days: "1", status: "DECLINED", createdAt: old(RETENTION.closedRequestDays) },
        { fromUserId: passengerId, toUserId: driverId, direction: "PM", days: "1", status: "DECLINED" },
      ],
    });
    await db.scheduleException.createMany({ data: [{ userId: passengerId, date: "2025-01-06", kind: "OFF" }, { userId: passengerId, date: "2099-01-05", kind: "OFF" }] });
    await db.message.createMany({ data: [{ poolId: ended.id, userId: driverId, body: "old chat" }, { poolId: pool.id, userId: driverId, body: "live chat" }] });
    await db.invitation.createMany({
      data: [
        { orgId, email: "never@example.org", createdAt: old(RETENTION.invitationDays) },
        { orgId, email: "recent@example.org" },
        { orgId, email: "used@example.org", createdAt: old(RETENTION.invitationDays), usedAt: new Date() },
      ],
    });
    await db.verificationToken.createMany({ data: [{ identifier: "a@example.org", token: "expired", expires: daysAgo(1) }, { identifier: "b@example.org", token: "valid", expires: new Date(Date.now() + 60_000) }] });
    await db.report.createMany({
      data: [
        { reporterId: passengerId, reportedUserId: driverId, reason: "LATE", status: "RESOLVED", resolvedAt: old(RETENTION.resolvedReportDays) },
        { reporterId: passengerId, reportedUserId: driverId, reason: "LATE", status: "OPEN", createdAt: old(RETENTION.resolvedReportDays) },
      ],
    });
    await db.auditLog.createMany({ data: [{ orgId, action: "EXPORT", targetType: "Organisation", targetId: orgId, createdAt: old(RETENTION.auditDays) }, { orgId, action: "EXPORT", targetType: "Organisation", targetId: orgId }] });
    const oldTrip = await db.trip.create({ data: { poolId: pool.id, date: "2025-01-06", direction: "AM", driverId, plannedDepart: "07:40", status: "DONE", plannedRoute: routeJson(driverId, passengerId, passengerHome) } });

    const r = await runRetention();

    expect((await db.geoCache.findMany()).map((g) => g.key).sort()).toEqual(["GEOCODE:fresh|", "ROUTE:recent"]);
    expect((await db.notification.findMany()).map((n) => n.title)).toEqual(["new"]);
    expect(await db.poolRequest.count()).toBe(1);
    expect((await db.scheduleException.findMany()).map((e) => e.date)).toEqual(["2099-01-05"]);
    expect((await db.message.findMany()).map((m) => m.body)).toEqual(["live chat"]);
    expect((await db.invitation.findMany()).map((i) => i.email).sort()).toEqual(["recent@example.org", "used@example.org"]);
    expect((await db.verificationToken.findMany()).map((v) => v.token)).toEqual(["valid"]);
    expect((await db.report.findMany()).map((x) => x.status)).toEqual(["OPEN"]);
    expect(await db.auditLog.count()).toBe(1);
    expect((await db.trip.findUniqueOrThrow({ where: { id: oldTrip.id } })).plannedRoute).not.toContain('"lat"');
    expect(r).toMatchObject({ geoCache: 3, routePoints: 1, notifications: 1, requests: 1, exceptions: 1, messages: 1, invitations: 1, tokens: 1, reports: 1, audit: 1 });
  });

  it("anonymises participants, the driver and the route twelve months after a pool ends", async () => {
    const pool = await db.pool.create({ data: { orgId, siteId, direction: "AM", name: "gone", status: "ENDED", endedAt: daysAgo(RETENTION.tripAnonymiseDays + 2) } });
    const trip = await db.trip.create({ data: { poolId: pool.id, date: "2025-01-06", direction: "AM", driverId, plannedDepart: "07:40", status: "DONE", plannedRoute: routeJson(driverId, passengerId, passengerHome), participants: { create: [{ userId: passengerId, status: "IN" }] } } });
    const r = await runRetention();
    expect(r.anonymised).toBe(1);
    const after = await db.trip.findUniqueOrThrow({ where: { id: trip.id }, include: { participants: true } });
    expect(after.driverId).toBeNull();
    expect(after.plannedRoute).toBeNull();
    expect(after.participants[0]).toMatchObject({ userId: null, anonymisedId: "retention" });
  });
});

describe("G4 / R4 consent is granular and withdrawal stops the processing", () => {
  beforeEach(base);

  it("location is required, research is optional", () => {
    expect(consentSchema.safeParse({ location: "on", research: null }).success).toBe(true);
    expect(consentSchema.safeParse({ location: "on", research: "on" }).success).toBe(true);
    expect(consentSchema.safeParse({ location: null, research: "on" }).success).toBe(false);
  });

  it("withdrawing location consent removes the user from matching, from colleagues' match lists and from their carpools", async () => {
    const third = (await makeUser(orgId, siteId, "p2@example.org", at(6, 0.5), { role: "PASSENGER" })).id;
    await recomputeOrg(orgId);
    const pool = await makePool(orgId, siteId, driverId, [passengerId, third]);
    await db.match.updateMany({ where: { driverId, passengerId }, data: { status: "CONVERTED" } });
    expect((await loadMatchesFor(driverId)).some((m) => m.other.id === third)).toBe(true);
    expect(await db.match.count({ where: { passengerId } })).toBeGreaterThan(0);

    await withdrawLocation(passengerId);

    // Not an input to the engine any more.
    expect((await loadEngineUsers(orgId)).some((u) => u.id === passengerId)).toBe(false);
    // Gone from every list, including the pair that had become a carpool.
    expect(await db.match.count({ where: { OR: [{ driverId: passengerId }, { passengerId }] } })).toBe(0);
    expect((await loadMatchesFor(driverId)).some((m) => m.other.id === passengerId)).toBe(false);
    // No longer a member, so the pool page (members only) no longer shows their home.
    expect(await db.poolMember.count({ where: { poolId: pool.id, userId: passengerId, status: "ACTIVE" } })).toBe(0);
    // A later recompute does not bring them back.
    await recomputeOrg(orgId);
    expect(await db.match.count({ where: { OR: [{ driverId: passengerId }, { passengerId }] } })).toBe(0);
    // The consent row records the withdrawal; the audit log, which administrators read, does not.
    expect(await db.consent.count({ where: { userId: passengerId, scope: "LOCATION_SHARING", withdrawnAt: { not: null } } })).toBe(1);
    expect(await db.auditLog.count()).toBe(0);
  });

  it("withdrawing research consent deletes the answers and takes the person out of every aggregate", async () => {
    for (let i = 0; i < 4; i++) await makeUser(orgId, siteId, `r${i}@example.org`, at(3 + i), { role: "PASSENGER" });
    expect((await computeMetrics(orgId)).survey).toMatchObject({ n: 6, suppressed: false, r1: { CAR_ALONE: 6 } });
    await withdrawResearch(passengerId);
    expect(await db.surveyResponse.count({ where: { userId: passengerId } })).toBe(0);
    expect(await db.consent.count({ where: { userId: passengerId, scope: "PILOT_RESEARCH", withdrawnAt: null } })).toBe(0);
    // Location consent and the account are untouched: the app still works for them.
    expect((await loadEngineUsers(orgId)).some((u) => u.id === passengerId)).toBe(true);
    expect((await computeMetrics(orgId)).survey).toMatchObject({ n: 5, r1: { CAR_ALONE: 5 } });
    // Answers without an open consent are ignored even if a row exists.
    await db.consent.updateMany({ where: { userId: driverId, scope: "PILOT_RESEARCH" }, data: { withdrawnAt: new Date() } });
    const m = await computeMetrics(orgId);
    expect(m.survey.n).toBe(4);
    expect(m.survey.suppressed).toBe(true);
    expect(m.survey.r1).toEqual({});
  });
});

describe("S3 / E1 minimum group sizes and what administrators can take away", () => {
  beforeEach(base);

  it("survey aggregates appear only from MIN_GROUP respondents", async () => {
    for (let i = 0; i < MIN_GROUP - 3; i++) await makeUser(orgId, siteId, `r${i}@example.org`, at(3 + i), { role: "PASSENGER" });
    expect((await computeMetrics(orgId)).survey).toMatchObject({ n: MIN_GROUP - 1, suppressed: true, r8: {} });
    await makeUser(orgId, siteId, "last@example.org", at(9), { role: "PASSENGER", r1: "BIKE" });
    const m = await computeMetrics(orgId);
    expect(m.survey).toMatchObject({ n: MIN_GROUP, suppressed: false, r1: { CAR_ALONE: MIN_GROUP - 1, BIKE: 1 }, r8: { YES: MIN_GROUP } });
    expect(m.values.commercial).toBe(1);
  });

  it("a heat-map cell needs MIN_CELL homes", async () => {
    // Two more homes within metres of the passenger: three in one 1 km cell.
    await makeUser(orgId, siteId, "n1@example.org", { lat: passengerHome.lat + 0.0005, lng: passengerHome.lng }, { role: "PASSENGER" });
    expect(await heatCells(orgId)).toEqual([]);
    await makeUser(orgId, siteId, "n2@example.org", { lat: passengerHome.lat + 0.0008, lng: passengerHome.lng }, { role: "PASSENGER" });
    const cells = await heatCells(orgId);
    expect(cells).toHaveLength(1);
    expect(cells[0].count).toBe(MIN_CELL);
  });

  it("CSV exports carry no ids, locations, pairings, gender or traceable answers", async () => {
    const admin = await db.user.create({ data: { orgId, email: "admin@example.org", name: "Admin", role: "ADMIN" }, include: { org: true } });
    session.user = admin;
    await db.user.update({ where: { id: passengerId }, data: { gender: "FEMALE", phone: "+32 470 11 22 33", homeAddress: "Teststraat 1" } });
    const pool = await makePool(orgId, siteId, driverId, [passengerId]);
    await db.trip.create({ data: { poolId: pool.id, date: "2026-09-21", direction: "AM", driverId, plannedDepart: "07:50", status: "DONE", participants: { create: [{ userId: driverId, status: "IN" }, { userId: passengerId, status: "IN" }] } } });
    await recomputeOrg(orgId);
    const { GET } = await import("@/app/admin/export/[kind]/route");
    const get = async (kind: string) => (await GET(new Request("http://x/"), { params: Promise.resolve({ kind }) })).text();
    const forbidden = [driverId, passengerId, "Teststraat", "+32 470", "FEMALE", "approx", "50.8", "Test pool"];

    const users = await get("users");
    expect(users.split("\n")[0]).toBe("email,name,role,status,onboarded,joined,isSeed");
    const matches = await get("matches");
    expect(matches.split("\n")[0]).toBe("direction,score,sharedDays,detourMinAvg,detourMinMax,status");
    const trips = await get("trips");
    expect(trips.split("\n")[0]).toBe("pool,date,direction,status,verified,distanceM,kmSaved,participantsIn,noShows");
    // Two consenting respondents are fewer than MIN_GROUP: the survey export is empty.
    expect(await get("survey")).toBe("");
    for (const csv of [users, matches, trips]) for (const x of forbidden) expect(csv, x).not.toContain(x);

    for (let i = 0; i < MIN_GROUP - 2; i++) await makeUser(orgId, siteId, `r${i}@example.org`, at(3 + i), { role: "PASSENGER" });
    const survey = await get("survey");
    expect(survey.split("\n")[0]).toContain("survey,r1,r2");
    expect(survey.split("\n")[0]).not.toMatch(/respondent|createdAt|userId/);
    expect(survey.trim().split("\n")).toHaveLength(MIN_GROUP + 1);
    // Another organisation's administrator gets none of it.
    const other = await makeOrg("other.org");
    session.user = await db.user.create({ data: { orgId: other.org.id, email: "boss@other.org", role: "ADMIN" }, include: { org: true } });
    expect((await get("users")).trim().split("\n")).toHaveLength(2);
    expect(await get("matches")).toBe("");
    session.user = { ...admin, role: "MEMBER" };
    expect((await GET(new Request("http://x/"), { params: Promise.resolve({ kind: "users" }) })).status).toBe(403);
  });
});

describe("S2 / C4 what a matched colleague's browser can receive", () => {
  beforeEach(base);

  it("a match view holds no address, exact coordinates, phone or gender", async () => {
    await db.user.update({ where: { id: driverId }, data: { phone: "+32 499 99 99 99", gender: "MALE", homeAddress: "Geheimstraat 9" } });
    await db.user.update({ where: { id: passengerId }, data: { gender: "MALE" } });
    await recomputeOrg(orgId);
    const views = await loadMatchesFor(passengerId);
    expect(views.length).toBeGreaterThan(0);
    const wire = JSON.stringify(views);
    const d = await db.user.findUniqueOrThrow({ where: { id: driverId } });
    for (const secret of ["+32 499", "Geheimstraat", "MALE", String(d.homeLat), "gender", "phone", "homeAddress", "homeLat"]) expect(wire, secret).not.toContain(secret);
  });
});

describe("S1 / S4 / X6 location cannot be narrowed down", () => {
  beforeEach(base);

  it("the approximate point depends only on the cell and the user id, never on where in the cell the home is", () => {
    const centre = snapToCell({ lat: 50.9001, lng: 4.4001 }, APPROX_CELL_M);
    const home1 = { lat: centre.lat + 0.0015, lng: centre.lng - 0.002 };
    const home2 = { lat: centre.lat - 0.0012, lng: centre.lng + 0.0025 };
    expect(haversineM(home1, home2)).toBeGreaterThan(400);
    // Two homes far apart in the same cell give the identical point: observing it many times, or averaging, adds nothing.
    expect(approximateLocation(home1, "user-1")).toEqual(approximateLocation(home2, "user-1"));
    // The offset is the same for every home of that user, so it says nothing about the home either.
    const other = snapToCell({ lat: 51.2, lng: 4.9 }, APPROX_CELL_M);
    const a = approximateLocation(home1, "user-1");
    const b = approximateLocation(other, "user-1");
    expect(a.lat - centre.lat).toBeCloseTo(b.lat - other.lat, 9);
    expect(haversineM(a, centre)).toBeLessThan(APPROX_CELL_M / 2);
  });

  it("the cold-start count uses approximate cells and stays silent below the minimum", async () => {
    const me = passengerId;
    const mk = async (i: number) => {
      const u = await makeUser(orgId, siteId, `inc${i}@example.org`, at(5.2 + i * 0.1, 1), { role: "PASSENGER" });
      await db.user.update({ where: { id: u.id }, data: { onboardingCompletedAt: null } });
    };
    for (let i = 0; i < COLD_START_MIN - 1; i++) await mk(i);
    expect(await countNearbyIncomplete(me)).toBe(0);
    await mk(9);
    expect(await countNearbyIncomplete(me)).toBe(COLD_START_MIN);
    // Moving the exact home without leaving the cell cannot change the answer: it is not an input.
    await db.user.update({ where: { id: me }, data: { homeLat: 0, homeLng: 0 } });
    expect(await countNearbyIncomplete(me)).toBe(COLD_START_MIN);
  });

  it("only the wizard's own pages are accepted as a return address", () => {
    expect(safeReturnTo("/profile")).toBe("/profile");
    expect(safeReturnTo("/schedule")).toBe("/schedule");
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example", "/admin", "", null, 3]) expect(safeReturnTo(bad)).toBeUndefined();
  });
});

describe("S5 photo metadata", () => {
  const seg = (marker: number, payload: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), Buffer.from([(payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "binary")),
    seg(0xe1, Buffer.from("Exif\0\0GPSLatitude 50.8467 GPSLongitude 4.3525", "binary")),
    seg(0xe1, Buffer.from("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Arno</x:xmpmeta>", "binary")),
    seg(0xfe, Buffer.from("shot at home")),
    seg(0xdb, Buffer.alloc(65)),
    Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]),
  ]);

  it("drops EXIF, XMP and comments and keeps the image", () => {
    const out = stripJpegBytes(jpeg);
    const text = out.toString("binary");
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("xmpmeta");
    expect(text).not.toContain("shot at home");
    expect(text).toContain("JFIF");
    expect(out.subarray(-9)).toEqual(jpeg.subarray(-9));
    expect(out.length).toBeLessThan(jpeg.length);
    const url = stripJpegMetadata(`data:image/jpeg;base64,${jpeg.toString("base64")}`);
    expect(Buffer.from(url.split(",")[1], "base64").toString("binary")).not.toContain("GPS");
  });

  it("refuses anything that is not a well-formed JPEG", () => {
    expect(() => stripJpegBytes(Buffer.from("not an image"))).toThrow();
    expect(() => stripJpegBytes(jpeg.subarray(0, 30))).toThrow();
    expect(aboutSchema.safeParse({ name: "A", photoUrl: "data:image/png;base64,AAAA", languages: [] }).success).toBe(false);
  });
});

describe("C1 cost sharing is capped", () => {
  beforeEach(base);

  it("the rate has a ceiling and passengers together never pay more than the rate times the driver's distance", async () => {
    expect(cappedRate(40)).toBe(40);
    expect(cappedRate(500)).toBe(KM_RATE_CEILING_CENTS);
    expect(cappedRate(-5)).toBe(0);
    // A rate far above the ceiling in the database (set before the cap, or by hand) is not applied.
    await db.organisation.update({ where: { id: orgId }, data: { kmRateCents: 500 } });
    const p2 = (await makeUser(orgId, siteId, "p2@example.org", at(5), { role: "PASSENGER" })).id;
    const pool = await makePool(orgId, siteId, driverId, [p2]);
    await db.trip.create({ data: { poolId: pool.id, date: "2026-09-21", direction: "AM", driverId, plannedDepart: "07:50", status: "DONE", distanceM: 10_000, participants: { create: [{ userId: driverId, status: "IN" }, { userId: p2, status: "IN" }] } } });
    const tally = await monthlyTally(pool.id, "2026-09");
    // 5 km × 60 c ÷ 2 people = 150 c, not 5 km × 500 c ÷ 2.
    expect(tally.lines).toEqual([{ from: p2, to: driverId, cents: 150 }]);
    const total = tally.lines.reduce((s, l) => s + l.cents, 0);
    expect(total).toBeLessThanOrEqual(10 * KM_RATE_CEILING_CENTS);
  });
});

describe("M2 two organisations never see each other", () => {
  it("matching, metrics, the heat map and the audit log stay inside the organisation", async () => {
    await resetDb();
    const a = await makeOrg("a.example");
    const b = await makeOrg("b.example");
    // Same place, same times, complementary roles: a perfect match if tenancy leaked.
    const da = await makeUser(a.org.id, a.site.id, "d@a.example", at(10), { role: "DRIVER" });
    const pb = await makeUser(b.org.id, b.site.id, "p@b.example", at(5, 1), { role: "PASSENGER" });
    const ra = await recomputeOrg(a.org.id);
    const rb = await recomputeOrg(b.org.id);
    expect(ra.matches + rb.matches).toBe(0);
    expect(await db.match.count()).toBe(0);
    expect((await loadEngineUsers(a.org.id)).map((u) => u.id)).toEqual([da.id]);
    expect((await computeMetrics(a.org.id)).signups).toBe(1);
    expect((await computeMetrics(b.org.id)).signups).toBe(1);
    expect(await countNearbyIncomplete(pb.id)).toBe(0);
    await audit(a.org.id, da.id, "EXPORT", "Organisation", a.org.id);
    await audit(b.org.id, pb.id, "EXPORT", "Organisation", b.org.id);
    expect(await db.auditLog.count({ where: { orgId: a.org.id } })).toBe(1);
  });
});

describe("X4 a lift can only be taken from a driver the app offers", () => {
  beforeEach(base);

  it("refuses a driver from another organisation and a site that is not the user's", async () => {
    const other = await makeOrg("other.org");
    const foreign = await makeUser(other.org.id, other.site.id, "d@other.org", at(10), { role: "DRIVER" });
    session.user = await db.user.findUniqueOrThrow({ where: { id: passengerId }, include: { org: true } });
    const { acceptLiftAction } = await import("@/app/(app)/trips/[id]/actions");
    const form = (driver: string, site: string) => {
      const f = new FormData();
      f.set("driverId", driver);
      f.set("date", "2026-09-21");
      f.set("direction", "AM");
      f.set("siteId", site);
      return f;
    };
    await acceptLiftAction(form(foreign.id, siteId));
    await acceptLiftAction(form(driverId, other.site.id));
    expect(await db.pool.count()).toBe(0);
    expect(await db.trip.count()).toBe(0);
    // The genuine offer still works.
    await expect(acceptLiftAction(form(driverId, siteId))).rejects.toThrow(/REDIRECT \/trips\//);
    expect(await db.tripParticipant.count({ where: { userId: passengerId, status: "IN" } })).toBe(1);
  });
});

describe("P2 / P5 suspension notice and invitation footer", () => {
  beforeEach(base);

  it("suspending needs a reason, tells the person why and how to contest, and records the reason", async () => {
    const admin = await db.user.create({ data: { orgId, email: "admin@example.org", name: "Admin", role: "ADMIN" }, include: { org: true } });
    session.user = admin;
    const { suspendAction } = await import("@/app/admin/actions");
    const form = (reason?: string) => {
      const f = new FormData();
      f.set("id", passengerId);
      f.set("status", "SUSPENDED");
      if (reason) f.set("reason", reason);
      return f;
    };
    await suspendAction(form());
    expect((await db.user.findUniqueOrThrow({ where: { id: passengerId } })).status).toBe("ACTIVE");
    await suspendAction(form("SAFETY"));
    expect((await db.user.findUniqueOrThrow({ where: { id: passengerId } })).status).toBe("SUSPENDED");
    const mail = sent.find((m) => m.to === "pass@example.org")!;
    expect(mail.subject).toContain("suspended");
    expect(mail.text).toContain(t.admin.suspendReasons.SAFETY);
    expect(mail.text).toContain("If you think this is a mistake");
    const row = await db.auditLog.findFirstOrThrow({ where: { action: "SUSPEND" } });
    expect(row).toMatchObject({ orgId, actorId: admin.id, targetId: passengerId });
    expect(JSON.parse(row.details!)).toEqual({ reason: "SAFETY" });
    // The log entry names nobody.
    expect(row.details).not.toContain("pass@example.org");
  });

  it("an invitation says who sent it and why, and does not pretend the person already takes part", async () => {
    const admin = await db.user.create({ data: { orgId, email: "admin@example.org", name: "Admin", role: "ADMIN" }, include: { org: true } });
    session.user = admin;
    const { inviteAction } = await import("@/app/admin/actions");
    const f = new FormData();
    f.set("emails", "new.person@elsewhere.com");
    await expect(inviteAction(f)).rejects.toThrow(/REDIRECT/);
    const mail = sent.find((m) => m.to === "new.person@elsewhere.com")!;
    expect(mail.text).toContain("added your address to its staff carpooling pilot");
    expect(mail.text).toContain(`${RETENTION.invitationDays} days`);
    expect(mail.text).not.toContain(t.email.footer);
    // Every notification email carries the way to mute.
    expect(renderEmail({ title: "x", body: "y" }, "http://l").text).toContain("/settings");
    // The audit entry counts, it does not list addresses.
    expect((await db.auditLog.findFirstOrThrow({ where: { action: "INVITE" } })).details).not.toContain("elsewhere.com");
  });
});

describe("S9 / X5 configuration guards", () => {
  it("refuses the built-in secret in pilot mode and in production, allows it in development and during a build", () => {
    const dev = "dev-secret-change-me";
    expect(() => assertSafeSecret({ AUTH_SECRET: dev, PILOT_MODE: true }, "development", undefined)).toThrow(/AUTH_SECRET/);
    expect(() => assertSafeSecret({ AUTH_SECRET: dev, PILOT_MODE: false }, "production", undefined)).toThrow(/AUTH_SECRET/);
    expect(() => assertSafeSecret({ AUTH_SECRET: dev, PILOT_MODE: false }, "production", "phase-production-build")).not.toThrow();
    expect(() => assertSafeSecret({ AUTH_SECRET: dev, PILOT_MODE: false }, "development", undefined)).not.toThrow();
    expect(() => assertSafeSecret({ AUTH_SECRET: "a-real-secret-value", PILOT_MODE: true }, "production", undefined)).not.toThrow();
  });

  it("the content security policy allows only this origin, the tile server, and scripts with the nonce", () => {
    const csp = buildCsp({ nonce: "N0NCE", dev: false, tileUrl: "https://{s}.tiles.example.org/{z}/{x}/{y}.png", https: true });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-N0NCE' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("img-src 'self' data: blob: https://*.tiles.example.org");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(buildCsp({ nonce: "n", dev: true, tileUrl: "", https: false })).toContain("https://tile.openstreetmap.org");
  });
});
