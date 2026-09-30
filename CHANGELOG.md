# CHANGELOG

## Phase 0 — Scaffold (2026-09-16)

- Next.js 16 / TypeScript strict / Tailwind 4 scaffold under `src/`.
- Prisma 6 schema for the full §4 data model plus Auth.js tables; String enums, JSON as text; initial migration.
- Auth.js v5 magic-link sign-in with an org-aware Prisma adapter, domain allowlist, admin invitations and `ADMIN_EMAILS` bootstrap. Rate-limited sign-in.
- Signed-in layout that forces onboarding and re-consent.
- Seed script: organisation, site and admins from env; 40 fake staff in four corridors; purge.
- PWA manifest, generated icons, app-shell service worker, install banner on the second visit, offline page.
- Vitest (geo and time helpers) and Playwright (allowed vs refused domain, magic-link sign-in) wired into `npm test`.
- Dev conveniences guarded by `NODE_ENV=development && PILOT_MODE !== 'true'`: `/dev`, `/dev/mailbox`, `/dev/login-as/[userId]`.

## Phase 1 — Onboarding (2026-09-16)

- Seven-screen wizard under `/onboarding?step=N`; progress saved per step in `onboardingStep`; URL can never skip ahead of saved progress; back always available.
- Address search via Photon (400 ms debounce, 3-character minimum) with a draggable Leaflet pin and Nominatim reverse geocoding; exact and approximate coordinates stored.
- School-days step with presets, "same every day" and a per-day grid (site, times, flex, AM/PM), weekend toggle.
- Role, preferences (gender stored only when same-gender matching is chosen), research questions R1–R10, and a consent step with two required boxes and ground rules. Policy version recorded; changing it forces re-consent.
- Completion recomputes this user's matches and lands on `/matches`.
- `/profile` (four sections) and `/schedule` (days plus exceptions) reuse the wizard forms; saving recomputes matches immediately.
- Playwright: 390 px onboarding in 26 interactions, reload keeps progress, refusing consent blocks completion, database rows asserted.
- Matching engine and geo provider landed early because completion depends on them (see Phase 2).

## Phase 2 — Matching (2026-09-16)

- Pure engine in `src/lib/matching/`: candidate lists, hard filters (shared days, smoking, gender, corridor prefilter with 30-candidate cap, routed detour with 2-minute dwell, time feasibility, capacity), pickup arithmetic, scoring per §6.5, reasons as localisable codes, EITHER×EITHER orientation choice, per-user recompute, multi-stop insertion, `findLift`.
- All twelve §11.2 scenarios plus extras in Vitest with fixed coordinates and a stub router.
- Geo provider: Photon type-ahead, Nominatim reverse (throttled, User-Agent), OSRM routing with haversine fallback flagged `estimated`; everything cached in `GeoCache`.
- `Match` persistence: upsert by unique key, stale rows deleted, CONVERTED rows untouched; `npm run recompute`; per-user recompute on every profile/schedule save.
- `/matches`: AM/PM tabs, score, reasons, per-day plan, dismiss, request form, cold-start count within 8 km, invite share link.
- Seeded site of 40 users: 125 matches, 5.6 s cold against the public OSRM demo, 0.14 s warm.

## Phase 3 — Pools (2026-09-17)

- Requests: ask to join / invite with pre-filled days and message, accept, decline with optional canned reason, withdraw, 7-day expiry in the nightly job.
- Accept forms a pool (or extends it) via §6.7 insertion, converts the match, stores per-weekday pickup times, notifies both parties; infeasible additions are refused with a reason.
- Pool page: members with phone (pool members only), route map with stops, per-weekday timetable, chat, upcoming trips, "I can't make it on…", leave, report link; driver extras: meeting point per member, change days, pause/resume, driver rotation per ISO week.
- Daily engine: 18:00 materialisation of the next business day (skips non-working days and OFF exceptions, applies CHANGED times) and one-tap digest; driver defaults to IN; trip CONFIRMED when the driver confirms; driver cancel notifies everyone (always emailed) and the trip page offers backup lifts and a transit link; 20:00 verification prompt; DONE/NOT_HAPPENED/NO_SHOW; 72-hour auto-close unverified; km saved computed per §8.2.
- Cost tally per month with netting; hidden when every member chose ALTERNATE. Thumbs up after a DONE trip.
- Scheduler: node-cron in `instrumentation.ts` (digest at the org's digest time, 20:00 verification, 02:00 nightly, 07:00 quiet-hours flush, Monday 09:00 weekly). Quiet hours 22:00–07:00 and per-user email mute honoured, driver-cancelled exempt.
- Tests: Vitest integration suite against `prisma/unit.db` (digest, non-working day, exceptions, cancel + lifts, verification, auto-close, tally hand-computed, accept/insert/capacity); Playwright request → accept → plan, schedule change updates matches, digest job + cancel + lifts.

## Phase 4 — Admin (2026-09-17)

- `/admin` dashboard: every §8.2 metric with its definition on hover and for screen readers; go/no-go panel against editable thresholds; unmatched-by-reason from live engine diagnostics; survey bar charts R1–R9 in plain SVG and R10 as a list; heat map of 1 km cells (≥ 2 staff) with singletons aggregated into 3 km cells.
- Users: CSV/paste invitations (allowlist + invitation email), suspend/reinstate, make admin, GDPR delete; CSV exports for users (minimal), matches, trips, survey (respondents numbered, never identified).
- Sites, holiday calendar (date ranges), organisation settings (domains, timezone, headcount, rates, CO2, matchable threshold, digest time, policy version, thresholds), reports queue with resolve/suspend, audit log, week-4 and exit survey sending.
- User settings: email mute, consents with withdrawal, JSON data export, self-delete with typed confirmation, report and block.
- `Trip.driverId` made nullable so a deleted driver's DONE trips survive anonymised.
- Tests: metrics hand-computed on a constructed organisation (sign-up rate, onboarding, role/site split, matchable, unmatched, pools, trips, km/CO2/money/parking, survey, go/no-go); heat map aggregation; delete cascade + anonymisation.

## Phase 5 — Pilot hardening (2026-09-17)

- `/privacy`: plain-language notice generated from the §9 rules, wording in `src/i18n/en.ts`, versioned with `policyVersion`.
- One HTML/text email template for every notification and invitation; quiet hours and mute honoured; driver cancellations exempt.
- `scripts/backup.sh` (SQLite backup API when available, keeps 30), `scripts/tunnel.sh` with an install hint, `docs/pilot-runbook.md`, `docs/launch-announcement.md` (staffroom note, poster text with QR placeholder, week-2 reminder).
- Nightly job also anonymises trip logs twelve months after a pool ends. Tomorrow's trips are materialised on app open (throttled) as well as at 18:00.
- Playwright now runs two servers: the normal one and a `PILOT_MODE=true` one on its own `distDir`; the pilot project asserts no `/dev` route exists while manifest, service worker and privacy notice still serve. Admin e2e covers dashboard, CSV invite, exports and the member lockout.
- Seed script importable; seed/purge test. Production build verified: service worker registers, manifest is standalone with 192/512 icons (installability criteria), all dev routes 404 in pilot mode.
- All admin and settings strings moved into `src/i18n/en.ts`. No `any` in the codebase.
- Clean-clone check: `npm run setup && npm run dev` from a fresh `git clone` works; scheduler starts for the seeded organisation.

## BSB branding and visual refresh (2026-09-30)

- School palette, Open Sans and the BSB logo throughout; navy header, bottom tab bar on phones, new landing and sign-in pages, restyled cards, chips, buttons, match scores and avatars; dark mode kept.
- PWA icons, theme colour, map colours and the email button follow the palette.
- Local demo organisation renamed to The British School of Brussels, Tervuren campus (`.env` only; `.env.example` stays generic).
- ESLint ignores `.next-pilot/`; Playwright assertions allow for first-visit compiles.

