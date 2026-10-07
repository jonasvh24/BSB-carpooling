import { PrismaClient } from "@prisma/client";

// One client per process; Next dev reloads modules, so cache it on globalThis.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Locally the schema's env("DATABASE_URL") points at SQLite. On Netlify the managed
// Postgres arrives as NETLIFY_DB_URL (pooled), so the URL is passed explicitly, with
// the flags Prisma needs behind a connection pooler on a serverless host.
function databaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL || process.env.NETLIFY_DATABASE_URL;
  if (!raw) return undefined;
  if (/^postgres/.test(raw) && !/pgbouncer=/.test(raw)) {
    return `${raw}${raw.includes("?") ? "&" : "?"}pgbouncer=true&connection_limit=1&connect_timeout=15`;
  }
  return raw;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: databaseUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
