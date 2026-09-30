# PLAN

Build plan derived from `docs/BRIEF.md`. A phase closes only when its acceptance checks pass and `npm test` is green. Decisions taken along the way are in `DECISIONS.md`; per-phase notes in `CHANGELOG.md`.

## Phase 0 — Scaffold

- [x] Next.js 16 App Router, TypeScript strict, Tailwind 4, `src/` layout, `@/*` alias
- [x] Prisma 6 + SQLite schema (String enums, JSON as text, Auth.js tables), initial migration
- [x] `src/lib/enums.ts` Zod unions for every enum-like column
- [x] Auth.js v5 magic link (Nodemailer), org-aware adapter, domain allowlist + invitations, `ADMIN_EMAILS` bootstrap
- [x] Sign-in pages, rate limiting, proxy redirect for signed-out visitors
- [x] Signed-in layout enforcing onboarding and current consent
- [x] Seed: org/site/admins from env; 40 fake staff; purge
- [x] PWA manifest, generated icons, app-shell service worker, install banner, offline page
- [x] Vitest + Playwright runners; `npm test` runs both; auth e2e (allowed vs refused domain)
- [x] `.env.example`, Mailpit compose file, dev mailbox, `/dev/login-as/[userId]`
- [x] `CLAUDE.md`, `PLAN.md`, `DECISIONS.md`, `CHANGELOG.md`

## Phase 1 — Onboarding

- [x] Wizard shell: one topic per screen, progress saved per step (`onboardingStep`), back always allowed
- [x] Step 1 About you (name, phone, photo, languages)
- [x] Step 2 Where you live (Photon type-ahead, Leaflet draggable pin, Nominatim reverse, approx location)
- [x] Step 3 School days (site, days, presets, same-every-day vs per-day grid, AM/PM)
- [x] Step 4 Driving or riding
- [x] Step 5 Preferences (gender stored only on opt-in)
- [x] Step 6 Research questions R1–R10 → `SurveyResponse ONBOARDING`
- [x] Step 7 Consent (two required boxes, ground rules) → `Consent` rows with policy version; re-consent on version change
- [x] Completion: run engine for this user, land on `/matches`
- [x] `/profile` and `/schedule` editing reusing the wizard components (+ schedule exceptions)
- [x] Playwright: 390 px onboarding in < 40 interactions; reload keeps progress; refusing consent blocks

## Phase 2 — Matching

- [x] `src/lib/matching/` pure engine: candidates, hard filters, time feasibility, pickup times, score, reasons
- [x] §11.2 scenarios 1–12 as Vitest fixtures with a stub router
- [x] Geo provider (`geocode`, `reverseGeocode`, `route`) with `GeoCache` and haversine fallback
- [x] Persist engine output to `Match` (upsert + delete stale), per-user sync recompute on save, `npm run recompute`
- [x] Nightly 02:00 recompute (cron, Phase 3 jobs module)
- [x] `/matches` list with scores and reasons, AM/PM tabs, dismiss, cold-start counts, invite link
- [x] Performance: 40-user seed 5.6 s cold (344 live OSRM calls), 0.14 s warm

## Phase 3 — Pools

- [x] Requests (ask to join / invite), accept/decline/withdraw, 7-day expiry
- [x] Pool creation, multi-stop insertion (§6.7), plan notification
- [x] Pool page: members, route map, weekday timetable, chat, upcoming trips, exceptions, leave, report
- [x] Driver extras: meeting point, change days, pause, rotation
- [x] Daily engine: 18:00 materialisation + digest, confirmations, driver cancel + backup lift (`findLift`), 20:00 verification, 72 h auto-DONE
- [x] Cost tally, reliability, thumbs up
- [x] Playwright request → accept → weekday plan; job tests (Vitest against an isolated SQLite file)

## Phase 4 — Admin

- [x] Dashboard metrics with definitions, go/no-go panel with editable thresholds
- [x] Survey charts (plain SVG), heat map
- [x] CSV invite, exports, sites, holidays, rates/headcount, recompute
- [x] User management (suspend, role, GDPR delete with cascade test), reports queue, audit log
- [x] Week-4 and exit surveys (admin send + `/survey/week4`, `/survey/exit`)
- [x] User settings: email mute, consents + withdraw, JSON export, self-delete, report + block

## Phase 5 — Pilot hardening

- [x] `PILOT_MODE` guards (e2e project boots a pilot-mode server and asserts every `/dev` route is 404), `/privacy` notice, email template, quiet hours, rate limits on sign-in, geo, requests, messages, reports
- [x] `scripts/backup.sh` (`npm run backup`), `scripts/tunnel.sh` (`npm run tunnel`), `docs/pilot-runbook.md`, `docs/launch-announcement.md`
- [x] Seed purge verified by test (real users and admins survive, seed pools go); PWA verified on a production build (`scripts/dev/pwa-check.mjs`: manifest linked, service worker active, icons 200, standalone display)
- [x] Retention job (trip logs anonymised 12 months after a pool ends) in the nightly run
- [x] `npm run setup && npm run dev` verified from a clean clone (41 users, scheduler started)
- [ ] Full flow on a real phone over the tunnel — needs the pilot owner's laptop and `cloudflared` (not installed here)

## Proposals (not built; brief §0.5)

- Web push once the PWA is installed on iOS (brief §12 lists it post-pilot).
- A `prisma.config.ts`/Postgres migration guide when moving off SQLite.
- Admin-configurable corridor and display-threshold constants (currently constants per §13).
- A "nudge non-completers" admin action that sends the weekly reminder on demand.
