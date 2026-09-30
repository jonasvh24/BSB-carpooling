# Staff Carpooling Pilot — Build Brief for Claude Code

**Working title:** Poolmate (rename freely; nothing depends on it). **Repo:** `carpool-pilot`.

This document is the specification, the build plan and the acceptance criteria. Read it in full before writing any code.

---

## 0. Working instructions

1. Read this brief end to end. Then write `PLAN.md`: tasks per phase (§10) and the decisions you had to make. Do not wait for answers; apply the defaults in §13 and log each choice in `DECISIONS.md`.
2. Create `CLAUDE.md` from §2 (stack, commands, conventions) so later sessions stay consistent.
3. Build in phase order. A phase closes only when its acceptance checks pass and `npm test` is green.
4. The matching engine (§6) is a pure TypeScript module: no database access, no framework imports, tests written before the UI that uses it.
5. Do not build anything listed in §12. Do not add paid APIs or API keys. Anything you think is missing goes in `PLAN.md` under "Proposals"; carry on without it.
6. Keep `CHANGELOG.md` per phase. One commit per task, conventional commit messages.
7. Home addresses are personal data under GDPR. §9 is a set of hard requirements, not polish.

---

## 1. What this is and what the pilot must prove

Recurring commute carpooling for the staff of one school, built multi-tenant (organisation → sites → users) so other schools and companies are added as data later, not as a rewrite.

The pilot answers three questions, in order:

| # | Question | Answered by | Phase |
|---|---|---|---|
| 1 | Density: do enough staff live near each other, with compatible hours, to be matched at all? | Onboarding survey + match engine, before a single pool exists | 1–2 |
| 2 | Behaviour: do matches become pools that are still running after week 4? | Pools, daily confirmations, trip log | 3 |
| 3 | Commercial: would the school or an employer pay, and for what? | Research questions in the survey, admin impact metrics, exit survey | 4–5 |

A failed question 1 ends the pilot. The admin dashboard must show the answer within days of launch.

Out of scope for the pilot: students, parents, school-trip logistics, in-app payments, app-store apps.

---

## 2. Decisions already made

### 2.1 Platform

| Option | Verdict | Reason |
|---|---|---|
| Native iOS/Android | No | Store review, two codebases, no pilot benefit |
| Responsive website only | Almost | No home-screen icon, no route to push notifications later |
| Mobile-first PWA | **Yes** | One codebase, installs to the home screen, works on desktop, web push can be added post-pilot |

### 2.2 Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (latest stable), App Router, TypeScript strict, Tailwind CSS | Server components and server actions; Zod validates every input |
| Database | Prisma + SQLite (`file:./dev.db`) | Schema must stay Postgres-portable: no Prisma enums, no `Json` columns. Store enums as `String` constrained by Zod unions in `src/lib/enums.ts`; store JSON as text and parse with Zod at the boundary |
| Auth | Auth.js (next-auth v5+), email magic link | Sign-in restricted to the organisation's allowed email domains plus admin-invited addresses. `ADMIN_EMAILS` env bootstraps the first admins |
| Email | Nodemailer via SMTP env | In development: log the magic link to the console and to Mailpit (optional Docker service). No mailbox route of any kind when `PILOT_MODE=true` |
| Maps | Leaflet (react-leaflet) with OpenStreetMap tiles | No keys, no cost |
| Geocoding | Photon (`photon.komoot.io`) for type-ahead; Nominatim for reverse geocoding when the pin is dragged (≤1 req/s, proper `User-Agent`) | Everything cached in `GeoCache`. Nominatim's policy forbids per-keystroke search, hence Photon for autocomplete |
| Routing | OSRM public demo (`router.project-osrm.org/route/v1/driving`), cached | No SLA. Fallback when unavailable: haversine × 1.3 at 35 km/h for ≤10 km, 55 km/h beyond |
| Provider interface | `src/lib/geo/provider.ts` exposing `geocode()`, `reverseGeocode()`, `route(points[])` | Mapbox/Google/ORS swap in post-pilot without touching callers |
| Time | Organisation timezone `Europe/Brussels`; schedules stored as local `HH:mm`; dates as `YYYY-MM-DD`; date-fns + date-fns-tz | 24-hour clock everywhere |
| Tests | Vitest (engine, scoring, time maths); Playwright (onboarding smoke, request→accept flow) | `npm test` runs both |
| PWA | `manifest.webmanifest`, icons, minimal service worker (app shell only), install banner on second visit | Offline beyond the shell is not required |
| Scheduling | In-process `node-cron`: 18:00 daily digest, 20:00 trip verification prompt, 02:00 full recompute | Fine for a single-process pilot |
| Sharing during the pilot | `npm run tunnel` → `cloudflared tunnel --url http://localhost:3000` | Public HTTPS URL for staff phones. `AUTH_URL` must be set to the tunnel URL |

### 2.3 Commands

```
npm run setup            # install, prisma migrate, seed org/site from env, seed demo users
npm run dev              # http://localhost:3000
npm run seed             # 40 fake staff around the site (isSeed=true)
npm run seed:purge       # delete all isSeed users and everything attached to them
npm run recompute        # full match recompute
npm run tunnel           # cloudflared quick tunnel
npm test
```

### 2.4 Conventions

British English in all UI copy. 24-hour times, ISO dates, km and metres. No emojis. Comments explain why, not what. Every user-facing string lives in `src/i18n/en.ts` (NL/FR are a later data task). Semantic HTML, labelled inputs, visible focus states, contrast ≥ 4.5:1.

---

## 3. Tenancy and roles

- **Organisation**: a school or company. Allowed email domains, timezone, cost/CO2 settings, holiday calendar, headcount (for sign-up rate), one or more sites.
- **Site**: a physical workplace (campus) with coordinates and default bell times.
- **User**: one staff member, belonging to exactly one organisation. `MEMBER` or `ADMIN`. May work at different sites on different weekdays.
- Pilot setup: one organisation and one or more sites created by the seed script from env (`ORG_NAME`, `ORG_HEADCOUNT`, `SITE_NAME`, `SITE_ADDRESS`, `SITE_LAT`, `SITE_LNG`, `ALLOWED_EMAIL_DOMAINS`, `ADMIN_EMAILS`). Admins can add further sites in the UI.

---

## 4. Data model

Schema sketch. Write the real Prisma schema from this; relations and indexes are implied. All enum-like fields are `String` (see §2.2).

```
Organisation   id, name, slug, allowedEmailDomains (comma list, lower-case), timezone,
               headcount Int, kmRateCents Int (default 40), co2GramsPerKm Int (default 130),
               policyVersion String, matchDetourThresholdMin Int (default 10), createdAt

Site           id, orgId, name, address, lat Float, lng Float,
               defaultArriveBy "08:15", defaultDepartEarliest "16:30", parkingNote?, active Bool

User           id, orgId, email (unique), name, phone?, photoUrl?, role MEMBER|ADMIN,
               status ACTIVE|SUSPENDED|DELETED,
               gender? (stored only if the user opts into same-gender matching),
               homeAddress?, homeLat?, homeLng?, approxLat?, approxLng? (display cell, §9),
               onboardingStep Int, onboardingCompletedAt?, isSeed Bool, lastActiveAt?, createdAt
               index (orgId, homeLat, homeLng)

CommuteProfile userId (pk), rideRole DRIVER|PASSENGER|EITHER, preferDriving Bool,
               directions AM|PM|BOTH, vehicleDesc?, seatsAvailable Int (0–4),
               maxDetourMin Int, pickupStyle DOOR|MEETING_POINT, maxWalkM Int,
               maxExtraRideMin Int, smoking NO|YES|ANY, talk QUIET|CHATTY|ANY,
               music ANY|NONE|DRIVER_CHOICE, genderPref ANY|SAME, languages (comma list),
               costMode CONTRIBUTE|ALTERNATE|EITHER, notes? (≤200 chars), updatedAt

ScheduleEntry  id, userId, weekday Int (1=Mon … 7=Sun), siteId, arriveBy "HH:mm",
               arriveFlexMin Int, departEarliest "HH:mm", departFlexMin Int,
               wantsAm Bool, wantsPm Bool, active Bool         unique (userId, weekday)

ScheduleException id, userId, date, kind OFF|CHANGED, arriveBy?, departEarliest?, note?
               unique (userId, date)

NonWorkingDay  id, orgId, date, label                          unique (orgId, date)

SurveyResponse id, userId, surveyKey ONBOARDING|WEEK4|EXIT, answers (JSON text), createdAt

Consent        id, userId, policyVersion, scope LOCATION_SHARING|PILOT_RESEARCH,
               acceptedAt, withdrawnAt?

Match          id, orgId, siteId, driverId, passengerId, direction AM|PM, score Int (0–100),
               sharedDays "1,2,4", detourMinAvg Float, detourMinMax Float, extraRideMinAvg Float,
               details (JSON text: per weekday {pickupTime, siteTime, detourMin}; reasons[]),
               status NEW|SEEN|DISMISSED_BY_DRIVER|DISMISSED_BY_PASSENGER|CONVERTED, computedAt
               unique (driverId, passengerId, direction)

PoolRequest    id, poolId?, fromUserId, toUserId, direction, days, message?,
               status PENDING|ACCEPTED|DECLINED|EXPIRED|WITHDRAWN, createdAt, respondedAt?

Pool           id, orgId, siteId, direction AM|PM, name, status FORMING|ACTIVE|PAUSED|ENDED,
               rotateDrivers Bool, createdAt, endedAt?

PoolMember     id, poolId, userId, memberRole DRIVER|PASSENGER, days "1,2,3",
               pickupLat?, pickupLng?, pickupLabel?, stopOrder Int,
               pickupTimes (JSON text: weekday → "HH:mm"), status ACTIVE|LEFT, joinedAt, leftAt?
               unique (poolId, userId)

Trip           id, poolId, date, direction, driverId,
               status PLANNED|CONFIRMED|CANCELLED|DONE|NOT_HAPPENED, verified Bool,
               plannedDepart "HH:mm", plannedRoute? (JSON text), distanceM?, kmSaved?, createdAt
               unique (poolId, date, direction)

TripParticipant id, tripId, userId, status IN|OUT|NO_SHOW|UNKNOWN, respondedAt?
               unique (tripId, userId)

Message        id, poolId, userId, body (≤1000 chars), createdAt
Notification   id, userId, kind, title, body, link?, createdAt, readAt?, emailedAt?
Report         id, reporterId, reportedUserId, poolId?, reason, details?,
               status OPEN|RESOLVED, createdAt, resolvedAt?, resolvedById?
Block          id, blockerId, blockedId, createdAt              unique (blockerId, blockedId)
GeoCache       key (pk), kind GEOCODE|REVERSE|ROUTE, value (JSON text), createdAt
AuditLog       id, actorId?, action, targetType, targetId, details?, createdAt
```

Notes:
- `Match` is a cache of engine output, always regenerable. Upsert by the unique key; delete rows the engine no longer produces.
- `Trip` rows are materialised one business day ahead (§7.4); never generated for `NonWorkingDay` dates.
- Deleting a user (§9) removes their rows and anonymises their `TripParticipant` history to a placeholder id.

---

## 5. Onboarding survey

Rules: a wizard, one topic per screen, progress saved on every step, back always allowed, completable in under five minutes on a phone. Matches are shown only after the final consent step. The same components are reused for later editing under `/schedule` and `/profile`.

### Step 0 — Sign in
Email → magic link. Copy: "Sign in with your school email address." Addresses outside the allowed domains are refused unless an admin invited them.

### Step 1 — About you
- Name (required).
- Phone (optional). Helper: "Only shared with the people in your carpool."
- Photo (optional).
- Languages you are comfortable chatting in: Dutch / French / English / other (multi-select; a soft matching preference only).

### Step 2 — Where you live
- Address search (Photon type-ahead, 400 ms debounce, minimum 3 characters).
- Map with a draggable pin. Copy: "Drag the pin to your front door if it's off."
- On drag, reverse-geocode for the label; store exact `homeLat/homeLng`; compute `approxLat/approxLng` (§9).
- Helper: "Colleagues only see roughly where you live until you're in a carpool together."

### Step 3 — Your school days
- If the organisation has more than one site: "Which school are you at?" (default for all days; per-day override in the grid below).
- "Which days are you at school?" Mon–Fri toggles; "Show weekend" reveals Sat/Sun.
- "What time must you be there?" Presets 07:30 / 07:45 / 08:00 / 08:15 / 08:30 plus custom.
- "How much earlier are you happy to arrive?" 0 / 10 / 20 / 30 / 45 min.
- "Earliest you can leave in the afternoon?" Presets 15:00 / 15:30 / 16:00 / 16:30 / 17:00 plus custom.
- "How long could you stay on after that if needed?" 0 / 15 / 30 / 45 / 60 / 90 min.
- "Same every day?" Yes applies the answers to all selected days. No opens a per-day grid (site, arrive by, flex, leave after, flex, AM/PM toggles). This is where part-time staff and multi-campus staff live; make the grid comfortable on a phone.
- "Which trips do you want to share?" Morning / Afternoon / Both. Afternoons vary far more than mornings for teachers; one-way pools are normal.

### Step 4 — Driving or riding
- "How do you want to carpool?" I'll drive / I'd rather ride / Either. If Either: "Given the choice, I'd prefer to…" drive / ride.
- Driver (and Either): car make and colour ("so colleagues recognise you"); seats free for colleagues 1–4; max detour per trip 5 / 10 / 15 / 20 / 30 min; pickup style at their door / at a meeting point.
- Passenger (and Either): max walk to a pickup point 0 / 250 / 500 / 1000 m; max extra time in the car compared with driving yourself 10 / 15 / 20 / 30 / 45 min.

### Step 5 — Preferences
- Smoking in the car: no / yes / don't mind.
- Mornings: quiet / chatty / don't mind.
- Music: any / none / driver's choice.
- "Only carpool with people of the same gender" (opt-in). If yes, ask gender and store it; otherwise store nothing.
- Costs: "I'm happy to chip in for fuel" / "I'd rather we take turns driving" / "Either."
- Notes (optional, ≤200 characters, visible to matches). Placeholder: "e.g. I drop my kids at 07:50 first, so I'm flexible after that."

### Step 6 — Five minutes for the pilot (research questions)
Intro copy: "These answers help decide whether this is worth doing properly. They are only ever reported in aggregate."

| # | Question | Options |
|---|---|---|
| R1 | How do you usually get to school? | Car alone / car with others / public transport / bike / walk / mix |
| R2 | Typical one-way journey, door to door | minutes (number) |
| R3 | Roughly what does commuting cost you per month? | €0–50 / 50–100 / 100–200 / 200–300 / 300+ |
| R4 | Have you carpooled to work before? | Never / occasionally / regularly |
| R5 | Main reason you would try it | Save money / parking / environment / company / less driving stress / other |
| R6 | Biggest worry | Schedules / relying on others / privacy / losing independence / nobody near me / other |
| R7 | How likely are you to try it for four weeks? | 1–5 |
| R8 | Should the school fund a tool like this for staff? | Yes / maybe / no |
| R9 | Would you personally pay a small monthly fee if the school did not? | Yes, up to €3 / yes, up to €5 / no |
| R10 | What would make you use this? | Free text, optional |

R1 gates impact metrics: only passengers who answered "car alone" count towards km saved, CO2 and parking freed (§8.2).

### Step 7 — Consent and ground rules
Plain-language summary: what is stored, who sees what (§9), retention, how to delete your account. Two separate checkboxes, both required to proceed:
1. Location sharing: exact home location visible only to me and my carpool members; an approximate area visible to matched colleagues.
2. Pilot research: my survey answers and trip counts used in aggregated, anonymised reporting.

Ground rules (acknowledged, not a checkbox): be on time; cancel by 18:00 the day before where possible; report problems in the app; no smoking unless agreed.

Record `Consent` rows with `policyVersion`. Changing the policy version forces re-consent on next sign-in.

### Completion
Run the engine for this user immediately and land on `/matches`. If there are no matches, show: "No matches yet. N colleagues live within 8 km but haven't finished setting up" (counts only, never names) plus an "Invite a colleague" share link.

---

## 6. Matching engine

Location: `src/lib/matching/`. Pure functions over plain objects. Input: users with profiles and schedule entries for one site; a routing function; the date context. Output: `Match` candidates with per-weekday details and reasons. Tests in `src/lib/matching/__tests__/`.

### 6.1 Units of matching
Matching runs per **site × weekday × direction**. AM = home → site; PM = site → home. A pair's weekday results are aggregated into one `Match` per (driver, passenger, direction). One-way pools are first-class.

### 6.2 Candidate lists
For a given site, weekday and direction:
- Drivers: `rideRole ∈ {DRIVER, EITHER}`, `seatsAvailable ≥ 1`, active schedule entry for that weekday at that site, direction enabled, onboarding complete, status ACTIVE.
- Passengers: `rideRole ∈ {PASSENGER, EITHER}`, same schedule conditions.
- A user never matches themselves. `EITHER` users appear in both lists; when two `EITHER` users match, compute both orientations, keep the higher score, and add the reason "You could take turns driving".
- Exclude any pair where either has blocked the other, and any pair already `CONVERTED` for that direction.

### 6.3 Hard filters
1. At least one shared weekday.
2. Smoking: passenger `NO` with driver `YES`, or the reverse, excludes.
3. `genderPref = SAME` on either side excludes unless both genders are known and equal.
4. Corridor prefilter (straight line, no routing): `hav(D,P) + hav(P,S) − hav(D,S) ≤ driver.maxDetourMin × 0.7 km`. Keep at most the 30 nearest candidates by that value per driver, then route them.
5. Detour: `detourMin = dur(D→P→S) − dur(D→S)` (routed, cached) must be `≤ driver.maxDetourMin`. Add a 2-minute dwell per pickup.
6. Extra ride: `dur(pooled P→S) − dur(direct P→S) ≤ passenger.maxExtraRideMin` (bites only in multi-stop pools).
7. Time feasibility on at least one shared weekday (§6.4).
8. Capacity: seats free on that weekday = `seatsAvailable − active passenger members of the driver's pool that day`.

### 6.4 Time feasibility and pickup times
AM, for each user `u`: window at site `[arriveBy − arriveFlexMin, arriveBy]`.
- Common window `I = [max(lo), min(hi)]`; infeasible if empty.
- Target arrival `A = max(lo(I), hi(I) − 5)` (five minutes to park and walk in; people prefer leaving later, so aim at the late edge).
- Driver leaves home at `A − dur(D→…→S) − 2 min per stop`; each pickup time follows from cumulative durations.

PM: window `[departEarliest, departEarliest + departFlexMin]`.
- Common window as above; leave site at `lo(I) + 5` (gather-up buffer); drop-off times follow forward.

For ≤500 users per site, load everything once per run; no spatial index needed. Cache `dur(D→S)` per driver per direction.

### 6.5 Score (0–100)
```
detourScore      = clamp(1 − detourMin / driver.maxDetourMin, 0, 1)
timeScore        = clamp(1 − |arriveBy_D − arriveBy_P| / 45, 0, 1)      (PM: departEarliest)
daysScore        = sharedDays / max(daysD, daysP)
prefScore        = clamp(1 − 0.5 × softConflicts, 0, 1)
                   soft conflicts: QUIET vs CHATTY; no shared language when both listed
reliabilityScore = 0.7 until a user has ≥5 planned trips, then doneTrips / plannedTrips (min of the pair)

score = round(100 × (0.40·detourScore + 0.25·timeScore + 0.15·daysScore
                     + 0.10·prefScore + 0.10·reliabilityScore))
```
Per-weekday scores are averaged over shared feasible days. Show matches with `score ≥ 40`, sorted descending. Store per-day details and reasons.

### 6.6 Reasons (shown under every match)
Short, concrete, generated from the data: "+6 min detour", "Both at school by 08:10 on Mon, Tue, Thu", "Pickup 07:41 at your door", "Quiet mornings: you both prefer it", "You could take turns driving", "No trip history yet".

### 6.7 Multi-passenger pools
When adding a passenger to an existing pool: try inserting the new stop at every position between the driver's home and the site; keep the cheapest by added duration. Re-check the pool detour cap (driver's `maxDetourMin` applies to the whole route), every passenger's `maxExtraRideMin`, and capacity. Recompute stop order and pickup times for every weekday the passenger joins.

### 6.8 Recompute policy
- On any change to a user's home, profile or schedule: recompute that user's pairs (both orientations) synchronously.
- Nightly at 02:00: full recompute per site. Must finish in under two minutes for 500 users with warm route cache.
- Admin "Recompute now" button.

### 6.9 Backup lift (used by §7.5)
`findLift(passenger, date, direction)`: run the same filters for a single date against drivers of ACTIVE pools with a free seat that day plus standalone drivers, ignoring `daysScore`. Returns the top five.

---

## 7. Pools and daily operation

### 7.1 Requests
- From `/matches`: a passenger sends "Ask to join"; a driver sends "Invite". Optional message. Days pre-filled with shared days, editable.
- Recipient gets an in-app notification and an email. Accept creates a `Pool` (if the driver has none for that direction) or adds a member, runs §6.7, and sends both parties the weekday plan. Decline needs no reason (optional canned ones). Requests expire after seven days.
- A pool with one driver and one passenger is a pool. Additional members join the same way.

### 7.2 Pool page
Members (name, photo; phone visible only after acceptance), map with route and stops, per-weekday timetable (driver leaves, each pickup, arrival at site), chat, upcoming trips, "I can't make it on…" (creates a `ScheduleException`), "Leave carpool", "Report a problem". Driver extras: set a meeting point for a member (drag pin, labelled, e.g. "Delhaize car park"), change days, pause the pool, enable driver rotation.

### 7.3 Driver rotation
If `rotateDrivers` is on and at least two members have `seatsAvailable ≥ 1`, assign the driver per ISO week round-robin. Each week's trips are routed from that driver's home. Cost tally nets out.

### 7.4 Daily engine
- 18:00 (org time), and on demand when the app is opened: for every ACTIVE pool, materialise tomorrow's `Trip` (skip `NonWorkingDay`), with participants `IN` for members active that weekday, `OUT` where a `ScheduleException` says `OFF`, times adjusted for `CHANGED`.
- Digest notification: "Tomorrow 07:42 pickup at Rue X. Confirm / Can't make it." One tap each. Driver defaults to IN and must actively cancel. Trip becomes `CONFIRMED` once the driver has confirmed.
- 20:00 the same day as the trip: ask the driver "Did this morning's trip happen?" Yes / No / Someone didn't show → `DONE` (verified) / `NOT_HAPPENED` / marks `NO_SHOW`. After 72 hours with no answer, set `DONE` with `verified = false`.

### 7.5 Driver drops out
Immediate notification to all members. The passenger's screen shows "Find a lift" (§6.9) and a public-transport link built from coordinates (a Google Maps transit URL needs no key). Passengers can accept a one-off lift; that creates a one-day `Trip` under the other driver's pool with the extra participant.

### 7.6 Cost sharing
Per `DONE` trip and passenger `IN`: `contribution = directKm(P→S) × kmRateCents ÷ participantsIncludingDriver`. Monthly tally per pool shows who owes whom, netted when rotating. Copy: "Settle outside the app (bank transfer or Payconiq)." Hidden entirely for pools where members chose `ALTERNATE`.

### 7.7 Ratings and reliability
After a `DONE` trip: thumbs up, or "Report a problem" with reason. Reliability = `(done trips as participant) / (planned trips)` shown as "Reliable: 95% of 20 trips" once ≥5 trips.

---

## 8. Notifications and admin

### 8.1 Notifications
In-app centre plus email. Kinds: request received, request accepted/declined, pool plan changed, daily digest, driver cancelled (always emailed, cannot be muted), trip verification prompt, new match found, weekly "N colleagues joined near you". Users can mute all email except driver-cancelled. No email between 22:00 and 07:00 except driver-cancelled.

### 8.2 Admin dashboard (`/admin`, ADMIN only, scoped to the organisation)
Metrics, each with its definition on hover:

| Metric | Definition |
|---|---|
| Sign-up rate | users / `headcount` |
| Onboarding completion | completed / sign-ups |
| Role split, site split | counts |
| Matchable | completed profiles with ≥1 `Match` where `detourMinMax ≤ matchDetourThresholdMin` |
| Unmatched, by reason | no candidate in corridor / time mismatch / no drivers / capacity |
| Pools | active, paused, ended; average size |
| Trips per week | planned, confirmed, done, cancelled; cancellation and no-show rates |
| Km saved | Σ over DONE trips of direct km for passengers who answered R1 = "car alone", minus the driver's detour km |
| CO2 saved | km saved × `co2GramsPerKm` |
| Parking freed | distinct "car alone" passengers in DONE trips this week |
| Money saved | km saved × `kmRateCents` |
| Survey aggregates | R1–R9 as bar charts (plain SVG or recharts); R10 as a list |

Go/no-go panel with editable thresholds (§13) and current values, colour-coded.

Actions: invite users by CSV of emails (adds them to the allowlist and sends invitations), manage sites, holiday calendar, rates, headcount, recompute matches, export CSV (users minimal, matches, trips, survey), suspend user, delete user (GDPR, §9), review reports, send the week-4 and exit surveys. Every action writes `AuditLog`.

Heat map: home cells at 1 km resolution with counts, only cells with ≥2 users; singletons aggregated to 3 km cells.

### 8.3 Week-4 and exit surveys
Week 4 (`WEEK4`): trips shared so far (auto-filled), would recommend (1–5), what worked, what didn't, one change that would make you use it more. Exit (`EXIT`): same plus "Should the school keep this?" and "Should the school pay for it?" Admin triggers both; responses feed the dashboard.

---

## 9. Privacy, safety, security

Hard requirements:
1. Staff only. Sign-in requires an allowed domain or an admin invitation. No minors anywhere in the system.
2. Exact home location is visible only to the user and to members of a pool they have joined. Everyone else sees `approxLat/approxLng`: the home snapped to a roughly 500 m grid (cell size derived from `cos(lat)` so it holds anywhere), displayed as a 400 m circle with a small deterministic offset derived from the user id so the circle never sits on a grid line.
3. Phone numbers are shown only inside an accepted pool. Photos are optional.
4. Gender is stored only when the user opts into same-gender matching, and is never displayed.
5. `Consent` recorded with policy version and timestamp. Withdrawing location consent hides the user from matching until re-consented.
6. Delete account: hard-delete the user, profile, schedule, matches, requests, messages, notifications, survey responses and consents; anonymise `TripParticipant` rows. Export account data as JSON on request. Both available under `/settings/privacy`.
7. Retention: trip logs anonymised 12 months after the pool ends; `GeoCache` has no personal data.
8. Report and block: any user can report or block another; blocked pairs never match; admins see reports and can suspend.
9. Security: rate-limit sign-in and request endpoints; server-side authorisation on every action (user may only read pools they belong to); no dev routes when `PILOT_MODE=true`; HTTPS via the tunnel; secrets only in env; Prisma parameterised queries only.
10. `/privacy` page: a plain-language notice generated from these rules, versioned with `policyVersion`. Draft the text; the pilot owner edits it.

Development convenience, guarded by `NODE_ENV=development && PILOT_MODE !== 'true'`: `/dev/login-as/[userId]` to switch into a seeded user and exercise request → accept → daily confirmation flows from both sides.

---

## 10. Build phases and acceptance criteria

| Phase | Scope | Acceptance |
|---|---|---|
| 0 Scaffold | Repo, Next.js, Tailwind, Prisma schema, migrations, Auth.js magic link with domain allowlist, org/site seed from env, `CLAUDE.md`, `PLAN.md`, test runners, PWA manifest, `.env.example`, Mailpit compose file | `npm run setup && npm run dev` works from a clean clone; magic-link sign-in works via console link; a non-allowed domain is refused; `npm test` runs an empty suite green |
| 1 Onboarding | Steps 0–7 in full, address search and pin, per-day schedule grid, consent, profile/schedule editing pages, approximate-location computation | Playwright completes onboarding on a 390 px viewport in under 40 interactions; progress survives a reload; refusing consent blocks completion; `SurveyResponse`, `Consent`, `ScheduleEntry` rows are correct |
| 2 Matching | Engine with tests, route cache and fallback, seed script, `/matches` list with scores and reasons, per-user recompute on save, nightly recompute, cold-start counts and invite link, dismiss | All §11 scenarios pass; seeded site of 40 users yields matches in under 10 s cold and under 1 s warm; a schedule change updates matches immediately; every match shows at least two reasons |
| 3 Pools | Requests, accept/decline/expire, pool creation, multi-stop insertion, pool page with map/timetable/chat, exceptions, meeting points, daily materialisation, digest, confirmations, driver cancel and backup lift, verification prompt, cost tally, rotation, reliability | Playwright: passenger requests, driver accepts, both see the weekday plan; 18:00 job creates tomorrow's trips and notifications; driver cancel notifies and offers lifts; a `NonWorkingDay` produces no trips; tally matches §7.6 for a hand-computed case |
| 4 Admin | Dashboard metrics, go/no-go panel, survey charts, heat map, CSV invite and exports, sites and holidays, user management, reports queue, audit log, week-4/exit surveys | Every §8.2 metric matches a hand-computed value on seed data; exports open in a spreadsheet; delete-user cascade verified by test |
| 5 Pilot hardening | `PILOT_MODE` guards, rate limiting, `/privacy` page, install banner, email templates, tunnel script, backup script (copy `dev.db` nightly), `docs/pilot-runbook.md`, `docs/launch-announcement.md` (150-word staffroom note plus poster text with QR placeholder), seed purge | Full flow works on a real phone over the tunnel; `npm run seed:purge` leaves only real users; no dev routes reachable in pilot mode; Lighthouse PWA installable |

Do not start Phase 6 (§12).

---

## 11. Seed data and test scenarios

### 11.1 Seed (`npm run seed`)
40 fake staff, `isSeed = true`, names from Faker, emails `seed-NN@example.org`, all onboarding complete with consent. Homes relative to the site: 50% within 5 km, 30% at 5–15 km, 20% at 15–40 km, drawn from four directional clusters (staff cluster along commuting corridors, they are not uniformly spread). Schedules: 60% standard (arrive by 08:15, flex 15, leave 16:30, flex 30, Mon–Fri), 20% early or late variants, 20% part-time (2–3 days). Roles: 40% driver, 30% passenger, 30% either. Preferences random with realistic skews (smoking YES 10%, same-gender 10%). R1 answers: 55% car alone. Also seed two admins from `ADMIN_EMAILS`, one holiday week, and one "notes" example per ten users.

### 11.2 Engine test scenarios (Vitest, fixtures with fixed coordinates and a stub router)
1. Driver and passenger on the same corridor, 4 min detour, same times → matched, score > 70.
2. Passenger on the opposite side of the site → not matched (corridor filter).
3. Same corridor, passenger must arrive by 07:30, driver can't be there before 08:00 → not matched (time).
4. Same as 1 but driver has 0 seats free after existing members → not matched (capacity).
5. Part-time passenger (Mon, Wed) and full-time driver → matched with `sharedDays = "1,3"` and `daysScore = 0.4`.
6. Smoking conflict → excluded; QUIET vs CHATTY → `prefScore = 0.5`, still matched.
7. Two `EITHER` users → both orientations computed, higher kept, rotation reason present.
8. Multi-stop: adding a third member inserts at the cheapest position; pool detour cap respected; a fourth exceeding the cap is refused with reason.
9. PM matching independent of AM: same pair matched AM, not PM.
10. Routing provider throws → fallback heuristic used, match still produced, `details` flags `estimated = true`.
11. Pickup time arithmetic: hand-computed leave-home and pickup times for a two-stop AM route.
12. `findLift` returns only drivers with a free seat on that specific date and ignores day overlap.

---

## 12. Post-pilot backlog — do not build now

Self-serve organisation sign-up and billing; Postgres and hosted deployment (Fly.io or a small VPS; SQLite → Postgres is a provider change plus a migration); SSO with Microsoft 365 / Google Workspace (schools use these); HR export of carpool km per employee for the Belgian tax-free carpooling allowance [MED: verify current rules]; CO2 report formatted for the federal commuting diagnostic that Belgian employers over 100 staff file every three years [MED]; parking-management integration; web push (iOS needs the installed PWA); calendar sync; NL/FR translations; native wrapper only if a specific need appears; parents and students (separate safeguarding regime, separate product); event carpooling (school trips, sports days).

---

## 13. Defaults and assumptions

| Item | Default | Change in |
|---|---|---|
| Organisation timezone | Europe/Brussels | Admin settings |
| Headcount | 100 | Admin settings |
| Site bell times | arrive by 08:15, leave after 16:30 | Site settings |
| Arrival buffer / gather-up buffer | 5 min | constant |
| Pickup dwell | 2 min per stop | constant |
| Corridor prefilter | `maxDetourMin × 0.7 km`, max 30 candidates | constant |
| Match display threshold | score ≥ 40 | constant |
| Matchable threshold (dashboard) | detour ≤ 10 min | Admin settings |
| km rate | 40 cents/km (set to the current Belgian statutory rate, ≈ €0.43 in 2025 [MED]) | Admin settings |
| CO2 | 130 g/km | Admin settings |
| Request expiry | 7 days | constant |
| Digest time | 18:00 | Admin settings |
| Approximate location cell | ~500 m | constant |
| UI language | English; NL/FR ready | `src/i18n` |

Go/no-go thresholds for a six-week pilot (editable in admin; these are judgement calls, [MED]):

| Metric | Threshold |
|---|---|
| Sign-up rate | ≥ 30% of headcount |
| Onboarding completion | ≥ 80% of sign-ups |
| Matchable | ≥ 50% of completed profiles |
| Pool conversion | ≥ 25% of matchable users in an active pool by week 4 |
| Pool survival | ≥ 60% of pools formed still active at week 6 |
| Trip cadence | ≥ 3 shared trips per active pool per week |
| Cancellation rate | ≤ 15% of planned trips |
| Would recommend (week 4) | ≥ 60% scoring 4–5 |
| Commercial signal | R8 "yes" ≥ 50%, and leadership agrees to a per-site fee in the exit conversation |

If matchable is below 30% after two weeks of sign-ups, stop the pilot and report; do not build habits on a market that is not there.

---

## 14. Pilot runbook (for the pilot owner; Claude Code writes it into `docs/pilot-runbook.md`)

1. Configure `.env` with the real site, domain and admin emails. `npm run seed:purge`.
2. `npm run dev` and `npm run tunnel`; set `AUTH_URL` to the tunnel URL and restart. The laptop must stay on; if that is a problem, the hosted option in §12 is a day's work.
3. Import the staff email list via admin CSV. Post `docs/launch-announcement.md` in the staffroom with the QR code.
4. Week 1–2: watch sign-up rate and matchable. Nudge non-completers with the weekly email.
5. Week 2: if matchable ≥ 30%, open pools (they are open by default; this is the moment to announce them). Otherwise stop and report.
6. Week 4: send the week-4 survey.
7. Week 6: send the exit survey, export everything, hold the go/no-go review against §13.
8. Back up `dev.db` nightly (`scripts/backup.sh`).

---

## 15. Definition of done for the pilot build

- Phases 0–5 accepted; `npm test` green; no TypeScript errors; no `any` outside typed adapters.
- A new staff member can sign in, finish onboarding and see matches on a phone in under five minutes.
- A driver and a passenger can form a pool, receive the 18:00 digest, confirm, and log a completed trip, all over the tunnel.
- Admin can read every §8.2 metric and the go/no-go panel without touching the database.
- `CLAUDE.md`, `PLAN.md`, `DECISIONS.md`, `CHANGELOG.md`, `docs/pilot-runbook.md`, `docs/launch-announcement.md` and `/privacy` exist and are current.
