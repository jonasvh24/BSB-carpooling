import path from "node:path";
import { PrismaClient } from "@prisma/client";

// Direct database access for assertions, pointed at the e2e database.
export const testDb = new PrismaClient({
  datasources: { db: { url: `file:${path.resolve(process.cwd(), "prisma/test.db")}` } },
});
