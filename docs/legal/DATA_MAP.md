# Data map

> **Superseded on 2026-10-14** by `docs/DATA_MAP.md` and `docs/COMPLIANCE_GAP_REPORT.md`. Kept for history.

> **As found on 2026-09-30, before any fix.** Cells marked **GAP** are findings; each has a row in `COMPLIANCE_REGISTER.md`. This file is rewritten to the fixed state in Phase C.

Status: working document for the pilot owner and their lawyer. Not legal advice. Built from the code (`prisma/schema.prisma` and the modules that read and write it), not from the other documents. Where a document and the code disagreed, the code was taken as the truth and the disagreement is listed in `COMPLIANCE_REGISTER.md`.

Evidence is written as `` `path:line` ⟨needle⟩ ``: the needle is a literal piece of the line. `node scripts/legal-refs.mjs` checks every reference; `--fix` re-finds the line after code changes.

Confidence tags on legal statements: `[HIGH]`, `[MED]`, `[LOW]`.

## How to read the columns

- **Basis (proposed)**: the lawful basis the code is built to support. Choosing the basis is a controller decision and is open (see `LAWYER_QUESTIONS.md` Q1–Q4). "Consent" means the two consent scopes recorded in the `Consent` table. "Service" means processing needed to run the carpool service the staff member signed up for (GDPR Art. 6(1)(b) or 6(1)(f), to be decided) `[MED]`.
- **Seen by**: who can read the field through the application, and where that is enforced.
- **Retention**: the rule and the job that enforces it. As found, the only retention job is the 12-month trip anonymisation.
- **Export**: included in the user's JSON export (`/api/me/export`).
- **On delete**: what account deletion does to it.

Retention job: `` `src/lib/jobs/index.ts:26` ⟨export async function jobNightly⟩ `` calls `` `src/lib/gdpr.ts:44` ⟨export async function anonymiseOldTrips⟩ ``.
Export: `` `src/lib/gdpr.ts:19` ⟨export async function exportUserData⟩ ``. Deletion: `` `src/lib/gdpr.ts:5` ⟨export async function deleteUserCascade⟩ ``.

## User

| Field | Category | Purpose | Basis (proposed) | Seen by (enforced where) | Retention | Export | On delete |
|---|---|---|---|---|---|---|---|
| `email` | identity / contact | sign-in, notifications | Service | the user; admins of the same organisation (`` `src/app/admin/users/page.tsx:15` ⟨where: { orgId: admin.orgId }⟩ ``) | until account deletion | Y | delete |
| `emailVerified` | technical | sign-in | Service | nobody (not rendered) | until deletion | Y | delete |
| `name` | identity | shown to matches and pool members | Service | matched colleagues (`` `src/lib/matches-data.ts:102` ⟨name: other.name,⟩ ``), pool members, admins | until deletion | Y | delete. **GAP**: pools the user drove keep the name in `Pool.name` (`` `src/lib/pools/service.ts:59` ⟨name: fmt(t.pools.nameFormat⟩ ``) |
| `phone` | contact | contact inside a carpool | Service | pool members only (`` `src/app/(app)/pools/[id]/page.tsx:28` ⟨if (!me) redirect("/pools");⟩ ``); never selected for match cards | until deletion | Y | delete |
| `photoUrl` | identity | recognise a colleague | Service (optional field) | matched colleagues, pool members, request counterparts | until deletion or removed by user | Y | delete |
| `role`, `status` | technical | authorisation | Service | admins | until deletion | Y | delete |
| `gender` | preference | same-gender matching only | Consent by opt-in (stored only while the option is on: `` `src/app/(app)/onboarding/actions.ts:178` ⟨gender: d.genderPref === "SAME" ? d.gender || null : null⟩ ``) | nobody. Read only by the engine (`` `src/lib/matching/engine.ts:69` ⟨if (!a.gender || !b.gender || a.gender !== b.gender) return false;⟩ ``) and the user's own preferences form | until the option is switched off or deletion | Y | delete |
| `homeAddress` | location | label for the user's own pin | Consent (LOCATION_SHARING) | the user only; not selected anywhere else | until deletion | Y | delete |
| `homeLat`, `homeLng` | location | routing, pickup times | Consent (LOCATION_SHARING) | the user; members of a pool the user is in (pool map, `` `src/components/pool-map.tsx:18` ⟨only because every viewer is a member of this pool⟩ ``); sent to the routing provider without identity. **GAP**: still visible to pool members after location consent is withdrawn | until deletion | Y | delete from `User`. **GAP**: copies survive in `GeoCache` keys and in `Trip.plannedRoute` |
| `approxLat`, `approxLng` | location | approximate area | Consent (LOCATION_SHARING) | loaded for match cards (`` `src/lib/matches-data.ts:104` ⟨only the approximate cell is ever sent to a non-pool member⟩ ``) but not rendered. **GAP**: included per person, next to the email address, in the admin users export (`` `src/app/admin/export/[kind]/route.ts:25` ⟨approxLat: u.approxLat⟩ ``) | until deletion | Y | delete |
| `onboardingStep`, `onboardingCompletedAt` | behavioural | resume the wizard; dashboard totals | Service | **GAP**: admins see the exact step per person (`` `src/app/admin/users/page.tsx:69` ⟨fmt(t.admin.ui.step, { n: u.onboardingStep })⟩ ``), which shows who stopped at the consent step | until deletion | Y | delete |
| `muteEmail` | preference | email opt-out | Service | the user | until deletion | Y | delete |
| `lastActiveAt` | behavioural | activity stamp | Service | **GAP**: shown per person to admins (`` `src/app/admin/users/page.tsx:72` ⟨u.lastActiveAt ? formatInTimeZone⟩ ``) | until deletion | Y | delete |
| `isSeed` | technical | demo data | n/a | admins | n/a | Y | delete |
| `createdAt` | technical | sign-up date | Service | admins (users export) | until deletion | Y | delete |

## CommuteProfile

| Field | Category | Purpose | Basis (proposed) | Seen by | Retention | Export | On delete |
|---|---|---|---|---|---|---|---|
| `rideRole`, `preferDriving`, `directions`, `seatsAvailable`, `maxDetourMin`, `pickupStyle`, `maxWalkM`, `maxExtraRideMin` | preference | matching | Service | engine; effects visible to matches (who drives, pickup style) | until deletion | Y | delete |
| `vehicleDesc` | identity (indirect) | recognise the car | Service | matched passengers, pool members | until deletion | Y | delete |
| `smoking`, `talk`, `music`, `costMode`, `languages` | preference | matching and reasons | Service | engine; shared-preference reasons shown to matches | until deletion | Y | delete |
| `genderPref` | preference | same-gender matching | Consent by opt-in | engine only | until deletion | Y | delete |
| `notes` | free text | message to matches | Service (optional field) | matched colleagues | until deletion | Y | delete |

## Schedule

| Model.field | Category | Purpose | Basis (proposed) | Seen by | Retention | Export | On delete |
|---|---|---|---|---|---|---|---|
| `ScheduleEntry.*` | schedule | matching, pickup times | Service | engine; resulting times visible to matches and pool members | until deletion | Y | delete |
| `ScheduleException.*` (incl. `note`) | schedule | days off | Service | the user; effect (in / out) visible to pool members | **GAP**: never purged | Y | delete |

## Research and consent

| Model.field | Category | Purpose | Basis (proposed) | Seen by | Retention | Export | On delete |
|---|---|---|---|---|---|---|---|
| `SurveyResponse.answers` (ONBOARDING R1–R10, WEEK4, EXIT) | research | pilot evaluation | Consent (PILOT_RESEARCH). **GAP**: the consent is mandatory (`` `src/lib/validation/onboarding.ts:95` ⟨research: z.literal("on"),⟩ ``), cannot be withdrawn, and the answers are stored at step 6, before consent at step 7 | admins, as charts (`` `src/lib/admin/metrics.ts:96` ⟨r10: onboarding.map⟩ ``). **GAP**: no minimum group size; free-text and week-4 / exit answers are listed individually; the survey export is one row per person in sign-up order with a timestamp (`` `src/app/admin/export/[kind]/route.ts:38` ⟨respondent: seq.get(r.userId)⟩ ``) | until deletion | Y | delete |
| `Consent.*` | technical | proof of consent | Legal obligation to demonstrate consent (GDPR Art. 7(1)) `[HIGH]` | the user | until deletion | Y | delete (see Q9 on keeping proof) |

## Matching and carpools

| Model.field | Category | Purpose | Basis (proposed) | Seen by | Retention | Export | On delete |
|---|---|---|---|---|---|---|---|
| `Match.*` (score, shared days, detour minutes, per-day pickup times, reasons) | behavioural / derived location | suggestions | Consent (LOCATION_SHARING) | the two people in the match. **GAP**: admins can export every pair with both user ids (`` `src/app/admin/export/[kind]/route.ts:28` ⟨driverId: m.driverId, passengerId: m.passengerId⟩ ``) | regenerated nightly; deleted when either side withdraws location consent | Y | delete (cascade) |
| `PoolRequest.*` (incl. `message`) | behavioural / free text | form a carpool | Service | sender and recipient | **GAP**: never purged | Y | delete (cascade) |
| `PoolMember.*` (days, meeting point, pickup times) | schedule / location | run the carpool | Service | pool members | until the member leaves plus pool retention | Y | delete (cascade) |
| `Pool.name` | identity (contains the driver's name) | label | Service | pool members. **GAP**: admins, per trip, in the trips export | until pool deletion | Y | **GAP**: survives with the name |
| `Trip.*` (date, driver, status, distance, km saved) | behavioural | daily operation, impact metrics | Service; research aggregates under PILOT_RESEARCH | participants; admins as counts. **GAP**: the trips export lists the driver id per trip (`` `src/app/admin/export/[kind]/route.ts:31` ⟨driverId: tr.driverId ?? ""⟩ ``) | trip kept; participants anonymised 12 months after the pool ends | **GAP**: trips as driver are not in the export | driver reference set to null |
| `Trip.plannedRoute` (JSON: stop user ids, times, route points = home coordinates) | location | timetable on the trip page | Consent (LOCATION_SHARING) | participants (times and names only; points are not rendered) | **GAP**: kept for ever, including after anonymisation (`` `src/lib/pools/daily.ts:52` ⟨points: day.plan.points,⟩ ``) | Y (via trip) | **GAP**: not touched; home coordinates and the user id survive |
| `TripParticipant.*` | behavioural | confirmations, reliability | Service | participants; reliability percentage to matches after 5 trips | anonymised 12 months after the pool ends (`` `src/lib/gdpr.ts:44` ⟨export async function anonymiseOldTrips⟩ ``) | Y | anonymised. **GAP**: the placeholder is a hash of the user id (`` `src/lib/gdpr.ts:6` ⟨createHash("sha256").update(userId)⟩ ``) and the id stays in the audit log, so the link can be rebuilt |
| `Message.*` | free text | carpool chat | Service | pool members | **GAP**: kept after the pool ends | Y (own messages) | delete (cascade) |
| `Notification.*` (titles may name a colleague) | behavioural | inbox and email | Service | the recipient | **GAP**: never purged | Y | own inbox deleted. **GAP**: mentions of the deleted person in other inboxes stay |
| `Report.*` | free text about another person | safety | Legitimate interests / DSA notice-and-action `[MED]` | reporter; admins | **GAP**: never purged | reports made: Y; reports received: N (third-party data, see Q12) | delete both directions (cascade) |
| `Block.*` | preference | never match | Service | the blocker | until unblocked or deletion | Y | delete (cascade) |

## Tables without a user relation

| Table | Personal data in it | Reached by deletion | Retention |
|---|---|---|---|
| `Invitation` (email, inviter, dates) | email address of a person who has not signed up yet | **GAP**: no. The row is keyed by email, has no user relation and survives deletion | **GAP**: never purged |
| `VerificationToken` (email, token hash) | email address | **GAP**: no | **GAP**: expired tokens are never purged |
| `GeoCache` | GEOCODE keys are typed address text (`` `src/lib/geo/provider.ts:38` ⟨const key = `${q}|${near ? ptKey(near) : ""}`;⟩ ``); REVERSE and ROUTE keys are coordinates rounded to 4 decimals (about 11 m), so they contain home locations without a name. The schema comment says the opposite (`` `prisma/schema.prisma:398` ⟨// No personal data: keys are rounded coordinates or query strings.⟩ ``) | **GAP**: no | **GAP**: never purged |
| `AuditLog` (actor id, action, target id, details) | admin actions about staff; user ids. **GAP**: also self-service events with the actor: consent withdrawal (`` `src/app/(app)/settings/actions.ts:26` ⟨"WITHDRAW_CONSENT"⟩ ``) and trip thumbs-up, shown to admins with the actor's email; the page is not scoped to the organisation (`` `src/app/admin/audit/page.tsx:12` ⟨db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 })⟩ ``) | ids remain | **GAP**: never purged |
| `Account`, `Session` | unused (JWT sessions, no OAuth) | cascade | n/a |

## Data outside the database

See `SUBPROCESSORS.md` for data that leaves the machine. Storage on the machine and on the phone:

| Location | Personal data | Reached by deletion / retention |
|---|---|---|
| `backups/*.db` (`scripts/backup.sh`) | a full copy of the database | not reached by deletion; the script keeps the last 30 files (`` `scripts/backup.sh:18` ⟨tail -n +31⟩ ``). **GAP**: not documented to users, not encrypted, no runbook rule |
| Server console | in development mode outside pilot mode: full emails and magic links (`` `src/lib/mail.ts:27` ⟨console.log(`\n[mail] to=${opts.to}⟩ ``). **GAP**: the runbook runs the pilot with `npm run dev`, and the Next.js development server logs every request URL and server-action argument, which includes typed addresses (`` `src/components/onboarding/home-form.tsx:44` ⟨/api/geo/search?q=⟩ ``), pin coordinates and the email address on the sign-in page (`` `src/app/signin/actions.ts:29` ⟨/signin/sent?email=⟩ ``) | not stored by the app; terminal scroll-back only |
| `/dev/mailbox` | last 50 emails in memory, development only | gone on restart; 404 in pilot mode |
| `.next/` build cache | compiled code and the Next.js data cache; pages are rendered per request (`force-dynamic`), so no personal page is written to disk | n/a |
| Service worker cache on the phone | static files and the offline page only (`` `public/sw.js:2` ⟨Data pages always go to the network⟩ ``) | no personal data |
| `localStorage` on the phone | `visits` counter and `installDismissed` flag (`` `src/components/pwa-setup.tsx:22` ⟨localStorage.setItem("visits"⟩ ``) | no personal data; see register P3 |
| Session cookie | signed JWT with the user id | expires after 30 days or on sign-out |
| Photos | stored in the database as a data URL, not on disk | deleted with the account |
