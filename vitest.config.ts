import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests are pure. Integration tests (src/**/__tests__/*.db.test.ts) run
// against prisma/unit.db, migrated by the global setup, with geo mocked.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./src/test/global-setup.ts"],
    env: { DATABASE_URL: "file:./unit.db", NODE_ENV: "test", DISABLE_CRON: "true" },
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
