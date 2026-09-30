# jvcarpool — working notes for Claude Code

Staff carpooling pilot for one school, built multi-tenant (organisation → sites → users).
The full specification is `docs/BRIEF.md`. `PLAN.md` holds the task list, `DECISIONS.md`
the choices made where the brief left room, `CHANGELOG.md` one entry per phase.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router, TypeScript strict, Tailwind CSS 4. Server components + server actions. Zod validates every input. |
| Database | Prisma 6 + SQLite (`file:./dev.db`). Postgres-portable: no Prisma enums, no `Json` columns. Enum-like fields are `String` constrained by Zod unions in `src/lib/enums.ts`; JSON is stored as text and parsed with Zod at the boundary. |
| Auth | Auth.js v5 (`next-auth@beta`), email magic link via Nodemailer. Allowed email domains + admin invitations. `ADMIN_EMAILS` bootstraps admins. |
| Email | Nodemailer over SMTP env. In development the magic link is logged to the console and sent to Mailpit (`docker compose up`). No mailbox routes when `PILOT_MODE=true`. |
| Maps | Leaflet + react-leaflet, OpenStreetMap tiles. Client components only (`dynamic(..., { ssr: false })`). |
| Geo | `src/lib/geo/provider.ts`: `geocode()` (Photon), `reverseGeocode()` (Nominatim, ≤1 req/s, proper User-Agent), `route()` (OSRM public demo, haversine fallback). Everything cached in `GeoCache`. |
| Time | Org timezone `Europe/Brussels`. Schedules stored as local `HH:mm`, dates as `YYYY-MM-DD`. date-fns + date-fns-tz. 24-hour clock. |
| Tests | Vitest for the engine, scoring, time maths (`src/lib/**/__tests__`). Playwright for onboarding and request→accept smoke (`e2e/`). `npm test` runs both. |
| Scheduling | In-process `node-cron` started from `instrumentation.ts`: 18:00 digest, 20:00 verification prompt, 02:00 recompute. |
| PWA | `public/manifest.webmanifest`, `public/sw.js` (app shell only), install banner on second visit. |

## Commands

```
npm run setup            # install, prisma migrate, seed org/site from env, seed demo users
npm run dev              # http://localhost:3000
npm run seed             # 40 fake staff around the site (isSeed=true)
npm run seed:purge       # delete all isSeed users and everything attached to them
npm run recompute        # full match recompute
npm run tunnel           # cloudflared quick tunnel
npm test                 # vitest + playwright
npm run test:unit        # vitest only (pure + integration against prisma/unit.db)
npm run test:e2e         # playwright: app server on :3100 and a PILOT_MODE server on :3101, both on prisma/test.db
npm run typecheck        # tsc --noEmit
npm run backup           # copy prisma/dev.db to backups/
node scripts/dev/shot.mjs <url> <out.png> [userId]   # screenshot a page as a user (dev server on :3100)
node scripts/dev/pwa-check.mjs [base]                # production installability check
```

Port 3000 is often taken by other projects on this machine; use `npx next dev -p 3100` for manual checks.
Tests never touch `dev.db`. `vi.mock("@/lib/geo/provider")` with the stub router keeps integration tests offline.

## Layout

```
prisma/schema.prisma          data model (String enums, text JSON)
prisma/seed.ts                org/site from env + demo staff
src/lib/enums.ts              Zod unions for every enum-like column
src/lib/db.ts                 Prisma singleton
src/lib/auth.ts               Auth.js config, domain allowlist
src/lib/geo/                  provider interface + Photon/Nominatim/OSRM + cache
src/lib/matching/             PURE engine: no db, no framework imports. Tests first.
src/lib/matching/__tests__/   §11.2 scenarios
src/lib/pools/                pool formation, multi-stop insertion, trips, tally
src/lib/jobs/                 daily engine, digest, verification, recompute
src/lib/notify.ts             notifications + email with quiet hours
src/i18n/en.ts                every user-facing string
src/app/(app)/                signed-in routes: onboarding, matches, pools, schedule, profile, settings
src/app/admin/                ADMIN only, scoped to the organisation
src/app/dev/                  dev-only routes, removed in PILOT_MODE
src/lib/admin/                metrics, thresholds, audit
src/lib/gdpr.ts               delete cascade, export, retention
src/test/                     vitest global setup + row factory
e2e/                          Playwright (+ factory, db helper, global setup)
docs/                         brief, runbook, launch announcement
scripts/                      backup.sh, tunnel.sh, recompute.ts, make-icons.mjs, dev/
```

## Conventions

- British English in all UI copy. 24-hour times, ISO dates, km and metres. No emojis.
- Comments explain why, not what.
- Every user-facing string lives in `src/i18n/en.ts`.
- Semantic HTML, labelled inputs, visible focus states, contrast ≥ 4.5:1. Mobile-first (390 px).
- Server-side authorisation on every action; a user may only read pools they belong to.
- Home addresses are personal data. Exact coordinates only to the user and their pool members; everyone else gets `approxLat/approxLng` (§9 of the brief).
- Do not add paid APIs or API keys. Do not build anything in brief §12.
- One commit per task, conventional commit messages. Keep `CHANGELOG.md` per phase.
- `Match` rows are an engine cache: always regenerable, upsert by unique key, delete stale rows.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
