import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

// Fresh database per run: migrate, then seed the organisation, site and admins.
export default async function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_URL: "file:./test.db",
    ALLOWED_EMAIL_DOMAINS: "example.org",
    ADMIN_EMAILS: "admin@example.org",
    ORG_NAME: "Test School",
    SITE_NAME: "Main campus",
    SITE_LAT: "50.8467",
    SITE_LNG: "4.3525",
  };
  for (const f of ["prisma/test.db", "prisma/test.db-journal"]) rmSync(f, { force: true });
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts --org", { env, stdio: "inherit" });
}
