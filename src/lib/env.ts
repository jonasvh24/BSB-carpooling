import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().default("file:./dev.db"),
  AUTH_SECRET: z.string().min(8).default("dev-secret-change-me"),
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
  NOMINATIM_URL: z.string().default("https://nominatim.openstreetmap.org"),
  OSRM_URL: z.string().default("https://router.project-osrm.org"),
});

export const env = schema.parse(process.env);

// Dev conveniences (mailbox helper, /dev routes) exist only outside pilot mode.
export const isDevConvenienceEnabled = () =>
  process.env.NODE_ENV === "development" && !env.PILOT_MODE;
