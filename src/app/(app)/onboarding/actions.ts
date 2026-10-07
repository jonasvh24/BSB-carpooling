"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { approximateLocation } from "@/lib/geo/approx";
import { recomputeUser } from "@/lib/matching-service";
import { stripJpegMetadata } from "@/lib/photo";
import { rateLimit } from "@/lib/rate-limit";
import {
  aboutSchema,
  consentSchema,
  daysSchema,
  homeSchema,
  prefsSchema,
  researchSchema,
  roleSchema,
  HOME_CHANGES_PER_DAY,
  safeReturnTo,
  TOTAL_STEPS,
} from "@/lib/validation/onboarding";

export type StepState = { errors?: Record<string, string>; message?: string } | null;

function firstErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// Where to go after a successful save: the next wizard step, or back to the
// editing page when the same form is used under /profile or /schedule.
async function advance(userId: string, step: number, returnTo?: string): Promise<never> {
  if (returnTo) {
    revalidatePath(returnTo);
    redirect(`${returnTo}?saved=1`);
  }
  const next = Math.min(step + 1, TOTAL_STEPS);
  await db.user.update({ where: { id: userId }, data: { onboardingStep: { set: next } } }).catch(() => {});
  redirect(`/onboarding?step=${next}`);
}

function returnToOf(formData: FormData): string | undefined {
  return safeReturnTo(formData.get("returnTo"));
}


export async function saveAbout(_prev: StepState, formData: FormData): Promise<StepState> {
  const user = await requireUser();
  const parsed = aboutSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    photoUrl: formData.get("photoUrl") ?? "",
    languages: formData.getAll("languages"),
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const d = parsed.data;
  let photoUrl = "";
  try {
    photoUrl = d.photoUrl ? stripJpegMetadata(d.photoUrl) : "";
  } catch {
    return { errors: { form: "invalid" } };
  }
  await db.user.update({
    where: { id: user.id },
    data: {
      name: d.name,
      phone: d.phone || null,
      // Empty string keeps the existing photo; "remove" clears it.
      ...(photoUrl ? { photoUrl } : formData.get("removePhoto") ? { photoUrl: null } : {}),
      profile: { upsert: { create: { languages: d.languages.join(",") }, update: { languages: d.languages.join(",") } } },
    },
  });
  if (returnToOf(formData)) await recomputeUser(user.id);
  return advance(user.id, 1, returnToOf(formData));
}

export async function saveHome(_prev: StepState, formData: FormData): Promise<StepState> {
  const user = await requireUser();
  const parsed = homeSchema.safeParse({
    homeAddress: formData.get("homeAddress"),
    homeLat: formData.get("homeLat"),
    homeLng: formData.get("homeLng"),
  });
  if (!parsed.success) return { errors: { form: "needAddress" } };
  const d = parsed.data;
  const moved = user.homeLat != null && (user.homeLat !== d.homeLat || user.homeLng !== d.homeLng);
  if (moved && !rateLimit(`home:${user.id}`, HOME_CHANGES_PER_DAY, 24 * 60 * 60 * 1000)) return { errors: { form: "tooManyMoves" } };
  const approx = approximateLocation({ lat: d.homeLat, lng: d.homeLng }, user.id);
  await db.user.update({
    where: { id: user.id },
    data: { homeAddress: d.homeAddress, homeLat: d.homeLat, homeLng: d.homeLng, approxLat: approx.lat, approxLng: approx.lng },
  });
  if (returnToOf(formData)) await recomputeUser(user.id);
  return advance(user.id, 2, returnToOf(formData));
}

export async function saveDays(_prev: StepState, formData: FormData): Promise<StepState> {
  const user = await requireUser();
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { errors: { form: "invalid" } };
  }
  const parsed = daysSchema.safeParse(raw);
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const d = parsed.data;
  const sites = await db.site.findMany({ where: { orgId: user.orgId, active: true }, select: { id: true } });
  const siteIds = new Set(sites.map((s) => s.id));
  if (d.entries.some((e) => !siteIds.has(e.siteId))) return { errors: { form: "invalid" } };

  await db.$transaction([
    db.scheduleEntry.deleteMany({ where: { userId: user.id } }),
    db.scheduleEntry.createMany({
      data: d.entries.map((e) => ({
        userId: user.id,
        weekday: e.weekday,
        siteId: e.siteId,
        arriveBy: e.arriveBy,
        arriveFlexMin: e.arriveFlexMin,
        departEarliest: e.departEarliest,
        departFlexMin: e.departFlexMin,
        wantsAm: e.wantsAm && d.directions !== "PM",
        wantsPm: e.wantsPm && d.directions !== "AM",
      })),
    }),
    db.commuteProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, directions: d.directions },
      update: { directions: d.directions },
    }),
  ]);
  if (returnToOf(formData)) await recomputeUser(user.id);
  return advance(user.id, 3, returnToOf(formData));
}

export async function saveRole(_prev: StepState, formData: FormData): Promise<StepState> {
  const user = await requireUser();
  const parsed = roleSchema.safeParse({
    rideRole: formData.get("rideRole"),
    preferDriving: formData.get("preferDriving") === "DRIVE",
    vehicleDesc: formData.get("vehicleDesc") ?? "",
    seatsAvailable: formData.get("seatsAvailable") ?? 0,
    maxDetourMin: formData.get("maxDetourMin") ?? 10,
    pickupStyle: formData.get("pickupStyle") ?? "DOOR",
    maxWalkM: formData.get("maxWalkM") ?? 250,
    maxExtraRideMin: formData.get("maxExtraRideMin") ?? 15,
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const d = parsed.data;
  const isPassengerOnly = d.rideRole === "PASSENGER";
  const data = {
    rideRole: d.rideRole,
    preferDriving: d.rideRole === "DRIVER" ? true : d.rideRole === "PASSENGER" ? false : d.preferDriving,
    vehicleDesc: isPassengerOnly ? null : d.vehicleDesc || null,
    seatsAvailable: isPassengerOnly ? 0 : d.seatsAvailable,
    maxDetourMin: d.maxDetourMin,
    pickupStyle: d.pickupStyle,
    maxWalkM: d.maxWalkM,
    maxExtraRideMin: d.maxExtraRideMin,
  };
  await db.commuteProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  if (returnToOf(formData)) await recomputeUser(user.id);
  return advance(user.id, 4, returnToOf(formData));
}

export async function savePrefs(_prev: StepState, formData: FormData): Promise<StepState> {
  const user = await requireUser();
  const parsed = prefsSchema.safeParse({
    smoking: formData.get("smoking"),
    talk: formData.get("talk"),
    music: formData.get("music"),
    genderPref: formData.get("genderPref") === "on" ? "SAME" : "ANY",
    gender: formData.get("gender") ?? "",
    costMode: formData.get("costMode"),
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  const d = parsed.data;
  const data = { smoking: d.smoking, talk: d.talk, music: d.music, genderPref: d.genderPref, costMode: d.costMode, notes: d.notes || null };
  await db.$transaction([
    db.commuteProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data }),
    // §9.4: gender is stored only while the user opts into same-gender matching.
    db.user.update({ where: { id: user.id }, data: { gender: d.genderPref === "SAME" ? d.gender || null : null } }),
  ]);
  if (returnToOf(formData)) await recomputeUser(user.id);
  return advance(user.id, 5, returnToOf(formData));
}

export async function saveResearch(_prev: StepState, formData: FormData): Promise<StepState> {
  const user = await requireUser();
  // The research questions are optional. Skipping stores nothing and removes
  // anything stored by an earlier visit to this step.
  if (formData.get("skip")) {
    await db.surveyResponse.deleteMany({ where: { userId: user.id, surveyKey: "ONBOARDING" } });
    return advance(user.id, 6, returnToOf(formData));
  }
  if (user.onboardingCompletedAt) {
    const open = await db.consent.findFirst({ where: { userId: user.id, scope: "PILOT_RESEARCH", withdrawnAt: null }, select: { id: true } });
    if (!open) return { errors: { form: "invalid" } };
  }
  const parsed = researchSchema.safeParse(Object.fromEntries(["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"].map((k) => [k, formData.get(k) ?? ""])));
  if (!parsed.success) return { errors: firstErrors(parsed.error) };
  await db.$transaction([
    db.surveyResponse.deleteMany({ where: { userId: user.id, surveyKey: "ONBOARDING" } }),
    db.surveyResponse.create({ data: { userId: user.id, surveyKey: "ONBOARDING", answers: JSON.stringify(parsed.data) } }),
  ]);
  return advance(user.id, 6, returnToOf(formData));
}

export async function saveConsent(_prev: StepState, formData: FormData): Promise<StepState> {
  const user = await requireUser();
  const parsed = consentSchema.safeParse({ location: formData.get("location"), research: formData.get("research") });
  if (!parsed.success) return { errors: { form: "locationRequired" } };
  const research = parsed.data.research === "on";

  // Completion requires every earlier step to have produced its rows. The
  // research step is optional and is not checked.
  const [profile, days] = await Promise.all([
    db.commuteProfile.findUnique({ where: { userId: user.id } }),
    db.scheduleEntry.count({ where: { userId: user.id } }),
  ]);
  if (!user.name || user.homeLat == null || !profile || days === 0) {
    const step = !user.name ? 1 : user.homeLat == null ? 2 : days === 0 ? 3 : 4;
    redirect(`/onboarding?step=${step}`);
  }

  const version = user.org.policyVersion;
  await db.$transaction([
    db.consent.updateMany({ where: { userId: user.id, withdrawnAt: null }, data: { withdrawnAt: new Date() } }),
    db.consent.create({ data: { userId: user.id, scope: "LOCATION_SHARING", policyVersion: version } }),
    // Research refused: answers given at step 6 must not be kept.
    research
      ? db.consent.createMany({ data: [{ userId: user.id, scope: "PILOT_RESEARCH", policyVersion: version }] })
      : db.surveyResponse.deleteMany({ where: { userId: user.id } }),
    db.user.update({
      where: { id: user.id },
      data: { onboardingStep: TOTAL_STEPS + 1, onboardingCompletedAt: user.onboardingCompletedAt ?? new Date() },
    }),
  ]);
  await recomputeUser(user.id);
  redirect("/matches");
}
