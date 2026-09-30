import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

export default function setup() {
  for (const f of ["prisma/unit.db", "prisma/unit.db-journal"]) rmSync(f, { force: true });
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: "file:./unit.db" }, stdio: "ignore" });
}
