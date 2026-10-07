import { defineConfig, devices } from "@playwright/test";

// The e2e suite runs against its own SQLite file so it never touches dev.db.
// Two servers: the normal one (dev conveniences on) and a pilot-mode one that
// must expose no development route at all.
const port = 3100;
const pilotPort = 3101;
const env = {
  DATABASE_URL: "file:./test.db",
  AUTH_URL: `http://localhost:${port}`,
  PILOT_MODE: "false",
  ALLOWED_EMAIL_DOMAINS: "example.org",
  ADMIN_EMAILS: "admin@example.org",
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "1",
  OSRM_URL: "http://127.0.0.1:9",
  DISABLE_CRON: "true",
  OWNER_EMAIL: "owner@outside.test",
  OWNER_PASSWORD: "e2e-owner-password",
};

const mobile = { ...devices["Desktop Chrome"], isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 }, trace: "retain-on-failure" as const };

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  // The first visit to a route compiles it in dev; 5 s is too tight on a cold cache.
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  projects: [
    { name: "app", testIgnore: /pilot\.spec\.ts/, use: { baseURL: `http://localhost:${port}`, ...mobile } },
    { name: "pilot", testMatch: /pilot\.spec\.ts/, use: { baseURL: `http://localhost:${pilotPort}`, ...mobile } },
  ],
  webServer: [
    { command: `npx next dev -p ${port}`, port, reuseExistingServer: false, env, timeout: 120_000 },
    {
      command: `npx next dev -p ${pilotPort}`,
      port: pilotPort,
      reuseExistingServer: false,
      env: { ...env, AUTH_URL: `http://localhost:${pilotPort}`, PILOT_MODE: "true", NEXT_DIST_DIR: ".next-pilot" },
      timeout: 120_000,
    },
  ],
});
