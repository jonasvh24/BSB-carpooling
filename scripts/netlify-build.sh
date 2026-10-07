#!/usr/bin/env bash
# Netlify build: same code, Postgres instead of SQLite.
# 1. Derive a Postgres copy of the Prisma schema (only the datasource line differs).
# 2. Generate the client from it, push the schema, seed the organisation/site and term dates.
# 3. Build Next.js.
set -euo pipefail
# Netlify DB exposes the connection string as NETLIFY_DB_URL (older docs: NETLIFY_DATABASE_URL).
export DATABASE_URL="${DATABASE_URL:-${NETLIFY_DB_URL:-${NETLIFY_DATABASE_URL:-}}}"
if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set. Variables available that mention DATABASE/NEON/NETLIFY:" >&2
  env | cut -d= -f1 | grep -i -E 'DATABASE|NEON|NETLIFY' | sort >&2
  exit 1
fi
sed 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma > prisma/schema.postgres.prisma
npx prisma generate --schema prisma/schema.postgres.prisma
# Schema changes and seeding go over the direct (unpooled) connection; the app itself
# runs on the pooled DATABASE_URL.
DIRECT_URL="${NETLIFY_DB_URL_UNPOOLED:-${NETLIFY_DATABASE_URL_UNPOOLED:-$DATABASE_URL}}"
DATABASE_URL="$DIRECT_URL" npx prisma db push --schema prisma/schema.postgres.prisma --skip-generate --accept-data-loss
DATABASE_URL="$DIRECT_URL" npx tsx prisma/seed.ts --org
DATABASE_URL="$DIRECT_URL" npx tsx scripts/seed-term-dates.ts
npx next build
