// npm run seed          -> org/site/admins from env + 40 fake staff (isSeed = true)
// npm run seed -- --org -> org/site/admins only (used by `npm run setup`)
// npm run seed:purge    -> delete every isSeed user and everything attached
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";
import { approximateLocation } from "../src/lib/geo/approx";
import { destination } from "../src/lib/geo/haversine";
import { minToHm } from "../src/lib/time";

const db = new PrismaClient();

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function seedOrg() {
  const name = process.env.ORG_NAME ?? "Pilot School";
  const slug = slugify(name) || "pilot";
  const org = await db.organisation.upsert({
    where: { slug },
    create: {
      name,
      slug,
      allowedEmailDomains: envList("ALLOWED_EMAIL_DOMAINS").join(","),
      headcount: Number(process.env.ORG_HEADCOUNT ?? 100),
    },
    update: {
      allowedEmailDomains: envList("ALLOWED_EMAIL_DOMAINS").join(","),
      headcount: Number(process.env.ORG_HEADCOUNT ?? 100),
    },
  });

  const siteName = process.env.SCHOOL_SITE_NAME || process.env.SITE_NAME || "Main campus";
  let site = await db.site.findFirst({ where: { orgId: org.id, name: siteName } });
  const siteData = {
    address: process.env.SITE_ADDRESS ?? "",
    lat: Number(process.env.SITE_LAT ?? 50.8467),
    lng: Number(process.env.SITE_LNG ?? 4.3525),
  };
  site = site
    ? await db.site.update({ where: { id: site.id }, data: siteData })
    : await db.site.create({ data: { orgId: org.id, name: siteName, ...siteData } });

  for (const email of envList("ADMIN_EMAILS")) {
    await db.user.upsert({
      where: { email },
      create: { email, orgId: org.id, role: "ADMIN", name: "" },
      update: { role: "ADMIN" },
    });
    // Admins may be outside the allowed domains (e.g. a consultant running the pilot).
    await db.invitation.upsert({ where: { email }, create: { email, orgId: org.id }, update: {} });
  }
  console.log(`org "${org.name}" (${org.id}), site "${site.name}" (${site.id}), admins: ${envList("ADMIN_EMAILS").join(", ") || "none"}`);
  return { org, site };
}

function pick<T>(weights: Array<[T, number]>): T {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = faker.number.float({ min: 0, max: total });
  for (const [v, w] of weights) {
    if (r < w) return v;
    r -= w;
  }
  return weights[weights.length - 1][0];
}

export async function seedStaff(count = 40) {
  faker.seed(20260916);
  const { org, site } = await seedOrg();
  const siteLL = { lat: site.lat, lng: site.lng };
  // Staff cluster along commuting corridors: four directions, small spread.
  const corridors = [25, 110, 200, 300];

  await purgeSeed(false);

  for (let i = 1; i <= count; i++) {
    const nn = String(i).padStart(2, "0");
    const email = `seed-${nn}@example.org`;
    const band = pick<[number, number]>([
      [[600, 5000], 50],
      [[5000, 15000], 30],
      [[15000, 40000], 20],
    ]);
    const bearing = corridors[i % 4] + faker.number.float({ min: -12, max: 12 });
    const dist = faker.number.float({ min: band[0], max: band[1] });
    const home = destination(siteLL, bearing, dist);

    const rideRole = pick<"DRIVER" | "PASSENGER" | "EITHER">([
      ["DRIVER", 40],
      ["PASSENGER", 30],
      ["EITHER", 30],
    ]);
    const isDriverish = rideRole !== "PASSENGER";
    const sameGender = faker.number.float({ min: 0, max: 1 }) < 0.1;
    const gender = sameGender ? pick<string>([["FEMALE", 60], ["MALE", 38], ["OTHER", 2]]) : null;
    const smoking = pick<string>([["YES", 10], ["NO", 70], ["ANY", 20]]);
    const langs = faker.helpers.arrayElements(["nl", "fr", "en"], { min: 1, max: 3 });
    const notes = i % 10 === 0 ? faker.helpers.arrayElement([
      "I drop my kids at 07:50 first, so I'm flexible after that.",
      "Happy to leave a bit earlier on Fridays.",
      "I have a small car, two passengers max.",
      "Prefer to meet at the station car park.",
    ]) : null;

    const user = await db.user.create({
      data: {
        orgId: org.id,
        email,
        emailVerified: new Date(),
        name: faker.person.fullName(),
        phone: faker.helpers.maybe(() => `+32 4${faker.string.numeric(8)}`, { probability: 0.7 }) ?? null,
        gender,
        homeAddress: `${faker.location.streetAddress()}, ${faker.location.city()}`,
        homeLat: home.lat,
        homeLng: home.lng,
        onboardingStep: 8,
        onboardingCompletedAt: faker.date.recent({ days: 14 }),
        isSeed: true,
        lastActiveAt: faker.date.recent({ days: 7 }),
        profile: {
          create: {
            rideRole,
            preferDriving: rideRole === "EITHER" ? faker.datatype.boolean() : rideRole === "DRIVER",
            directions: pick<string>([["BOTH", 60], ["AM", 30], ["PM", 10]]),
            vehicleDesc: isDriverish ? `${faker.vehicle.manufacturer()} ${faker.vehicle.model()}, ${faker.vehicle.color()}` : null,
            seatsAvailable: isDriverish ? faker.number.int({ min: 1, max: 3 }) : 0,
            maxDetourMin: isDriverish ? faker.helpers.arrayElement([5, 10, 10, 15, 15, 20, 30]) : 10,
            pickupStyle: pick<string>([["DOOR", 70], ["MEETING_POINT", 30]]),
            maxWalkM: faker.helpers.arrayElement([0, 250, 500, 500, 1000]),
            maxExtraRideMin: faker.helpers.arrayElement([10, 15, 15, 20, 30, 45]),
            smoking,
            talk: pick<string>([["QUIET", 30], ["CHATTY", 25], ["ANY", 45]]),
            music: pick<string>([["ANY", 60], ["NONE", 15], ["DRIVER_CHOICE", 25]]),
            genderPref: sameGender ? "SAME" : "ANY",
            languages: langs.join(","),
            costMode: pick<string>([["CONTRIBUTE", 45], ["ALTERNATE", 20], ["EITHER", 35]]),
            notes,
          },
        },
      },
    });
    await db.user.update({
      where: { id: user.id },
      data: (() => {
        const a = approximateLocation(home, user.id);
        return { approxLat: a.lat, approxLng: a.lng };
      })(),
    });

    // Schedules: 60% standard, 20% early/late, 20% part-time.
    const kind = pick<"std" | "shift" | "part">([["std", 60], ["shift", 20], ["part", 20]]);
    const days = kind === "part" ? faker.helpers.arrayElements([1, 2, 3, 4, 5], { min: 2, max: 3 }) : [1, 2, 3, 4, 5];
    const arriveBy = kind === "shift" ? faker.helpers.arrayElement(["07:45", "08:00", "08:30", "08:45"]) : "08:15";
    const departEarliest = kind === "shift" ? faker.helpers.arrayElement(["15:30", "16:00", "17:00", "17:30"]) : "16:30";
    const flexA = kind === "std" ? 15 : faker.helpers.arrayElement([0, 10, 20, 30]);
    const flexD = kind === "std" ? 30 : faker.helpers.arrayElement([15, 30, 45, 60]);
    for (const weekday of days) {
      await db.scheduleEntry.create({
        data: {
          userId: user.id,
          weekday,
          siteId: site.id,
          arriveBy: kind === "shift" && faker.datatype.boolean(0.2) ? minToHm(Math.round((Math.random() * 60 + 450) / 15) * 15) : arriveBy,
          arriveFlexMin: flexA,
          departEarliest,
          departFlexMin: flexD,
          wantsAm: true,
          wantsPm: true,
        },
      });
    }

    const r1 = pick<string>([["CAR_ALONE", 55], ["CAR_SHARED", 8], ["PUBLIC_TRANSPORT", 15], ["BIKE", 12], ["WALK", 4], ["MIX", 6]]);
    await db.surveyResponse.create({
      data: {
        userId: user.id,
        surveyKey: "ONBOARDING",
        answers: JSON.stringify({
          r1,
          r2: Math.round(dist / 1000 * 2.2 + 5),
          r3: pick<string>([["0_50", 20], ["50_100", 30], ["100_200", 30], ["200_300", 15], ["300_PLUS", 5]]),
          r4: pick<string>([["NEVER", 60], ["OCCASIONALLY", 30], ["REGULARLY", 10]]),
          r5: pick<string>([["MONEY", 35], ["PARKING", 15], ["ENVIRONMENT", 25], ["COMPANY", 10], ["STRESS", 10], ["OTHER", 5]]),
          r6: pick<string>([["SCHEDULES", 35], ["RELIANCE", 25], ["PRIVACY", 10], ["INDEPENDENCE", 15], ["NOBODY_NEAR", 10], ["OTHER", 5]]),
          r7: faker.number.int({ min: 1, max: 5 }),
          r8: pick<string>([["YES", 55], ["MAYBE", 30], ["NO", 15]]),
          r9: pick<string>([["UP_TO_3", 30], ["UP_TO_5", 15], ["NO", 55]]),
          r10: faker.helpers.maybe(() => faker.lorem.sentence(), { probability: 0.3 }) ?? "",
        }),
      },
    });
    for (const scope of ["LOCATION_SHARING", "PILOT_RESEARCH"]) {
      await db.consent.create({ data: { userId: user.id, scope, policyVersion: org.policyVersion } });
    }
  }

  // One holiday week (autumn break) so the daily engine has something to skip.
  for (const d of ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"]) {
    await db.nonWorkingDay.upsert({
      where: { orgId_date: { orgId: org.id, date: d } },
      create: { orgId: org.id, date: d, label: "Autumn break" },
      update: {},
    });
  }
  console.log(`seeded ${count} staff around ${site.name}`);
}

export async function purgeSeed(log = true) {
  // Cascades in the schema remove profiles, schedules, matches, pools' members,
  // requests, messages, notifications, consents and survey answers.
  const seedUsers = await db.user.findMany({ where: { isSeed: true }, select: { id: true } });
  const ids = seedUsers.map((u) => u.id);
  if (ids.length) {
    // Pools whose driver was a seed user are meaningless without them.
    await db.pool.deleteMany({ where: { members: { some: { userId: { in: ids }, memberRole: "DRIVER" } } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  if (log) console.log(`purged ${ids.length} seed users`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--purge")) return purgeSeed();
  if (args.has("--org")) {
    await seedOrg();
    return;
  }
  await seedStaff(40);
}

if (process.argv[1]?.endsWith("seed.ts")) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
