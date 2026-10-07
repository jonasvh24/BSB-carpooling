import { z } from "zod";
import { HM_RE } from "../time";
import { CostMode, Directions, Gender, GenderPref, Language, Music, PickupStyle, RideRole, Smoking, Talk } from "../enums";

export const aboutSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+0-9 ()./-]*$/)
    .optional()
    .or(z.literal("")),
  // Photo is a small data URL produced client-side (≤ 256 px JPEG). JPEG only:
  // the server strips metadata from it (src/lib/photo.ts) and knows no other format.
  photoUrl: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/)
    .max(200_000)
    .optional()
    .or(z.literal("")),
  languages: z.array(Language).default([]),
});

export const homeSchema = z.object({
  homeAddress: z.string().trim().min(3).max(200),
  homeLat: z.coerce.number().min(-90).max(90),
  homeLng: z.coerce.number().min(-180).max(180),
});

export const dayEntrySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  siteId: z.string().min(1),
  arriveBy: z.string().regex(HM_RE),
  arriveFlexMin: z.number().int().min(0).max(120),
  departEarliest: z.string().regex(HM_RE),
  departFlexMin: z.number().int().min(0).max(180),
  wantsAm: z.boolean(),
  wantsPm: z.boolean(),
});

export const daysSchema = z.object({
  directions: Directions,
  entries: z.array(dayEntrySchema).min(1).max(7),
});

export const roleSchema = z
  .object({
    rideRole: RideRole,
    preferDriving: z.boolean().default(false),
    vehicleDesc: z.string().trim().max(80).optional().or(z.literal("")),
    seatsAvailable: z.coerce.number().int().min(0).max(4).default(0),
    maxDetourMin: z.coerce.number().int().min(0).max(60).default(10),
    pickupStyle: PickupStyle.default("DOOR"),
    maxWalkM: z.coerce.number().int().min(0).max(2000).default(250),
    maxExtraRideMin: z.coerce.number().int().min(0).max(90).default(15),
  })
  .superRefine((v, ctx) => {
    if (v.rideRole !== "PASSENGER" && v.seatsAvailable < 1) {
      ctx.addIssue({ code: "custom", path: ["seatsAvailable"], message: "Drivers need at least one free seat." });
    }
  });

export const prefsSchema = z
  .object({
    smoking: Smoking,
    talk: Talk,
    music: Music,
    genderPref: GenderPref.default("ANY"),
    gender: Gender.optional().or(z.literal("")),
    costMode: CostMode,
    notes: z.string().trim().max(200).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.genderPref === "SAME" && !v.gender) {
      ctx.addIssue({ code: "custom", path: ["gender"], message: "Tell us your gender to use same-gender matching." });
    }
  });

export const researchSchema = z.object({
  r1: z.enum(["CAR_ALONE", "CAR_SHARED", "PUBLIC_TRANSPORT", "BIKE", "WALK", "MIX"]),
  r2: z.coerce.number().int().min(0).max(300),
  r3: z.enum(["0_50", "50_100", "100_200", "200_300", "300_PLUS"]),
  r4: z.enum(["NEVER", "OCCASIONALLY", "REGULARLY"]),
  r5: z.enum(["MONEY", "PARKING", "ENVIRONMENT", "COMPANY", "STRESS", "OTHER"]),
  r6: z.enum(["SCHEDULES", "RELIANCE", "PRIVACY", "INDEPENDENCE", "NOBODY_NEAR", "OTHER"]),
  r7: z.coerce.number().int().min(1).max(5),
  r8: z.enum(["YES", "MAYBE", "NO"]),
  r9: z.enum(["UP_TO_3", "UP_TO_5", "NO"]),
  r10: z.string().trim().max(500).optional().or(z.literal("")),
});
export type ResearchAnswers = z.infer<typeof researchSchema>;

// Location sharing is what matching runs on, so it is required to use the app.
// Research is a separate, optional consent (GDPR Art. 7(4): not bundled).
export const consentSchema = z.object({
  location: z.literal("on"),
  research: z.literal("on").nullable().optional(),
});

export const TOTAL_STEPS = 7;

// The editing pages that reuse the wizard forms. Anything else is ignored, so a
// crafted form cannot turn the post-save redirect into a link to another site.
const RETURN_TO = ["/profile", "/schedule"];
export function safeReturnTo(value: unknown): string | undefined {
  return typeof value === "string" && RETURN_TO.includes(value) ? value : undefined;
}

// Matches show detours and pickup times computed from exact homes. Someone who
// could move their own home at will could read those numbers from many places
// and narrow down a colleague's address, so moves are rationed.
export const HOME_CHANGES_PER_DAY = 3;
