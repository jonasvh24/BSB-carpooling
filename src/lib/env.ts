import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().default("file:./dev.db"),
  AUTH_SECRET: z.string().min(8).default("dev-secret-change-me"), // DEV_SECRET below
  AUTH_URL: z.string().default("http://localhost:3000"),
  ORG_NAME: z.string().default("Pilot School"),
  ORG_HEADCOUNT: z.coerce.number().int().positive().default(100),
  SITE_NAME: z.string().default("Main campus"),
  SITE_ADDRESS: z.string().default(""),
  SITE_LAT: z.coerce.number().default(50.8467),
  SITE_LNG: z.coerce.number().default(4.3525),
  ALLOWED_EMAIL_DOMAINS: z.string().default(""),
  ADMIN_EMAILS: z.string().default(""),
  EMAIL_FROM: z.string().default("Carpool <carpool@localhost>"),
  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  PILOT_MODE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  GEO_USER_AGENT: z.string().default("jvcarpool-pilot/0.1 (dev)"),
  PHOTON_URL: z.string().default("https://photon.komoot.io"),
  GEOPUNT_URL: z.string().default("https://geo.api.vlaanderen.be/geolocation/v4"),
  NOMINATIM_URL: z.string().default("https://nominatim.openstreetmap.org"),
  OSRM_URL: z.string().default("https://router.project-osrm.org"),
  // Minimum gap between routing requests. 0 = none. The public demo server asks
  // for about one request per second; a self-hosted router needs no gap.
  OSRM_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(0),
  // Who runs this, shown on /privacy and /terms. Placeholders until the pilot
  // owner fills them in; the pages mark unfilled values clearly.
  CONTROLLER_NAME: z.string().default(""),
  CONTROLLER_ADDRESS: z.string().default(""),
  CONTROLLER_COMPANY_NUMBER: z.string().default(""),
  PRIVACY_CONTACT_EMAIL: z.string().default(""),
  DPO_CONTACT: z.string().default(""),
  // Owner sign-in with a password instead of a school mailbox. Both must be set
  // for it to exist; the account is an administrator. Keep them in .env only.
  OWNER_EMAIL: z.string().trim().toLowerCase().default(""),
  OWNER_PASSWORD: z.string().default(""),
  // Text messages for "forgot password" codes. All three must be set for real
  // SMS; in development the code is printed to the console and the dev mailbox.
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_FROM: z.string().default(""),
  // Shared secret for the scheduled-job endpoint (/api/jobs) on serverless hosts.
  JOBS_SECRET: z.string().default(""),
});

const DEV_SECRET = "dev-secret-change-me";

// Netlify defines its own SITE_NAME (the project slug), so the campus name may also
// come from SCHOOL_SITE_NAME, which wins when set.
export const env = schema.parse({ ...process.env, SITE_NAME: process.env.SCHOOL_SITE_NAME || process.env.SITE_NAME });

// Session cookies are signed with AUTH_SECRET. The built-in value is public
// (it is in this file), so anything but local development must set its own.
export function assertSafeSecret(e: { AUTH_SECRET: string; PILOT_MODE: boolean }, nodeEnv: string | undefined, phase: string | undefined) {
  const live = e.PILOT_MODE || (nodeEnv === "production" && phase !== "phase-production-build");
  if (live && e.AUTH_SECRET === DEV_SECRET) {
    throw new Error("AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and put it in .env before running in pilot mode or production.");
  }
}
assertSafeSecret(env, process.env.NODE_ENV, process.env.NEXT_PHASE);

// Dev conveniences (mailbox helper, /dev routes) exist only outside pilot mode.
export const isDevConvenienceEnabled = () =>
  process.env.NODE_ENV === "development" && !env.PILOT_MODE;
