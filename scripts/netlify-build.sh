#!/usr/bin/env bash
# Netlify build: same code, Postgres instead of SQLite.
# 1. Derive a Postgres copy of the Prisma schema (only the datasource line differs).
# 2. Generate the client from it, push the schema, seed the organisation/site and term dates.
# 3. Build Next.js.
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is not set — run 'netlify db init' or add a Postgres URL}"
sed 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma > prisma/schema.postgres.prisma
npx prisma generate --schema prisma/schema.postgres.prisma
npx prisma db push --schema prisma/schema.postgres.prisma --skip-generate --accept-data-loss
npx tsx prisma/seed.ts --org
npx tsx scripts/seed-term-dates.ts
npx next build
