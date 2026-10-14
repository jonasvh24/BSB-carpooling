# Compliance gap report

> Status: working document, 2026-10-14. Compares the code at commit `75c3f9b` with the legal, safeguarding and security brief (`bsb-carpool-legal-security-brief.md`, "the brief"). Not legal advice; the author is not a lawyer. Legal statements carry confidence tags: `[HIGH]` verified, `[MED]` likely but to confirm, `[LOW]` assumption.
>
> Supersedes `docs/legal/COMPLIANCE_REGISTER.md` (state as of 2026-09-30, which still describes magic-link sign-in).

## Verdict

The app is a working staff-only pilot built to an earlier specification (`docs/BRIEF.md`). Against the new brief it has **3 critical defects that are exploitable on the live site today**, and a set of **design conflicts** (authentication, hosting, location model) that cannot be closed by incremental fixes: each needs a decision before code is written (section 4).

| Severity | Meaning | Headline items |
|---|---|---|
| P0 | Exploitable on the live site now | Admin takeover via sign-up; unlimited password guessing; no mailbox proof |
| Critical | Brief MUST not met, real exposure of staff data | Password auth instead of SSO; admin without MFA; hosting outside the EU/EEA unconfirmed; SOS absent |
| High | MUST not met, exposure limited or indirect | Exact-home matching and pool maps; no field encryption; reports erasable by the reported person; suspension leaves trips running; no backups or incident plan for production; inaccurate privacy notice; no data-access log |
| Medium | Control partly present or documentation missing | ROPA, RLS, least-privilege DB role, logging redaction, retention schedule, legal document versioning |
| Low | Hardening, polish, Phase 2 preparation | Cookie notice, CSP styles, UUIDs, SBOM |

Phase 2 items (students, parents, minors) are listed but scored for Phase 1 exposure. Every one of them becomes Critical before the first minor account exists.

## 1. P0: exploitable on the live site

| # | Defect | Path | Evidence | Verified |
|---|---|---|---|---|
| P0-1 | **Admin takeover via sign-up.** Any account without a password can be claimed by anyone who types its address on `/signin/new`. Every `ADMIN_EMAILS` address is re-created password-less by each Netlify build, and the `OWNER_EMAIL` row never gets a password. | `/signin` with the admin address answers "This address has no password yet"; `/signin/new` with the same address and any password signs the attacker in as ADMIN. The domain check never runs on this branch. | `src/lib/auth.ts:41-47`, `prisma/seed.ts:57-64`, `src/lib/auth.ts:88`, `src/app/signin/actions.ts:39` | Reproduced locally 2026-10-14: `/admin` returned 200 for the attacker |
| P0-2 | **Unlimited password guessing.** The rate limit sits only in the sign-in server action. The same credentials check is exposed at `POST /api/auth/callback/credentials`, which needs only the CSRF token from `/api/auth/csrf`. The limiter is also in-memory, so on Netlify it is per function instance and resets on cold start. | Script: fetch CSRF token, loop POSTs. Applies to 8-character user passwords and to the break-glass `OWNER_PASSWORD`. | `src/app/signin/actions.ts:28`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/rate-limit.ts:1-3` | Reproduced locally: 12 wrong attempts unthrottled, 13th (correct) signed in |
| P0-3 | **No proof of mailbox ownership.** Any address on an allowed domain can be registered by someone else, with their own phone number. The real colleague is then locked out ("exists") and password-reset codes go to the impostor's phone. | `/signin/new` with `<colleague's staff number>@britishschool.be`. | `src/lib/auth.ts:51-56` (`emailVerified: new Date()`), `src/app/signin/actions.ts:48` | Read in code |

**Immediate mitigation (no code):** the owner of each `ADMIN_EMAILS` address sets a password on the live site now; check Admin → Users for unknown admins; leave `OWNER_EMAIL` unset until P0-1 is fixed in code.

## 2. Gaps by brief section

Status codes: **Met**, **Partial**, **Missing**, **Conflict** (current design contradicts the brief deliberately), **P2** (Phase 2 only, not exposed today).

### 2.1 Processing register and legal bases

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| `docs/ROPA.md` (Art. 30 record) | Missing | File absent | Medium |
| No field outside the 2.1 table | Conflict | Phone, photo, gender, car description, languages, smoking/talk/music, notes, schedule-exception notes, research survey answers, `lastActiveAt` (`prisma/schema.prisma:76-90,118-135,168,186-196`). See `docs/DATA_MAP.md` | Medium: each needs keep/drop decision |
| No special-category data | Partial | No structured Art. 9 field. Free text (profile notes, exception notes, chat, report details, survey R10) can carry it; UI only asks users not to (`src/i18n/en.ts:288,606`) | Low |
| No licence, ID or national-register numbers | Met | None stored | — |
| Human accepts every match (Art. 22 not engaged `[MED]`) | Met | Invitations require accept (`src/app/(app)/matches/actions.ts`); not yet stated in the notice | Low |
| Legal basis for matching: Art. 6(1)(b), not consent | Conflict | Current notice bases matching on location consent (`en.ts:556`) | Medium: controller decision |

### 2.2 Minors and consent

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| Roles student / parent / safeguarding_lead; age band; parent link | P2 | Roles are `MEMBER`/`ADMIN` only (`src/lib/enums.ts:6`) | Medium now |
| Under-13 rider profiles, 13–17 with verified parent, `MIN_STUDENT_ACCOUNT_AGE` | P2 | Absent | Medium now |
| Immutable, versioned parental consent with document hash | P2 | `Consent` is mutable (`withdrawnAt` updated in place, `src/lib/consent.ts:44`), no hash | Medium now |
| Staff-only gate actually excludes minors | Partial | Domain allowlist only. If pupils also hold `@britishschool.be` mailboxes `[LOW]`, they can self-register as staff (P0-3 makes this trivial) | High: confirm pupil address format |
| Teen-readable privacy notice | P2 | Absent | Low now |

### 2.3 Safeguarding rules

| Rule | Status | Evidence | Severity |
|---|---|---|---|
| Single `policy/safeguarding` module called by every match, trip, message and visibility check | Missing | Checks scattered: `src/lib/matching-service.ts:89-94`, `src/lib/matching/engine.ts:271`, `src/lib/pools/lifts.ts:48`, `matches/actions.ts:45-46` | High |
| R1 minors cannot drive | P2 | Any user may pick DRIVER | Medium now |
| R2 parent approves each driver | P2 | — | Medium now |
| R3 `ALLOW_STAFF_DRIVE_STUDENTS=false` | P2 | No flag; terms say the app is not for pupils (`en.ts:631`) | Medium now |
| R4 not discoverable | Partial | No search or browse. Backup-lift list after a cancellation shows unmatched drivers' names and photos (`src/app/(app)/trips/[id]/page.tsx:47-53`) | Low |
| R5 chat rules | Partial | Chat is per pool, no delete action, nothing disappears. But: a two-person pool is one-to-one; `PoolRequest.message` is one-to-one free text; no per-message report although the terms promise one (`en.ts:652`); messages cascade-delete with the author's account (`schema.prisma:347`) | Medium |
| R6 minimal minor profile | P2 | Photo optional, EXIF stripped (`src/lib/photo.ts`) | Low |
| R7 driver declaration, re-confirmed each term | Missing | One ground-rules sentence (`en.ts:285`), no record, no termly prompt; content lacks child restraints <135 cm and traffic-law clause | High: staff drive colleagues today |
| R8 suspension cancels future trips, notifies affected users, revokes sessions | Partial | Sets SUSPENDED and emails the person (`src/app/admin/actions.ts:56-76`). Requests are refused at once (`src/lib/session.ts:12`). But pool memberships remain and trips are still planned with a suspended driver (`src/lib/pools/daily.ts:28-75`, `plan.ts:16-20` filter on member status only); co-riders are not told; JWTs not revoked | High |
| R9 report and block; minor reports to safeguarding lead | Partial | Report and block exist. Report creation not audited and alerts nobody (`src/app/(app)/settings/actions.ts:73`). **Reports cascade-delete when either party deletes their account** (`schema.prisma:380-381`): a reported person can erase the report | High |

### 2.4 Cost-sharing only

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| No payments, tips, commission | Met | No payment code; terms say so (`en.ts:638`) | — |
| Admin-set €/km, capped at real costs | Met | `kmRateCents` default 40, form cap 60 (`admin/actions.ts:183`); whether 60 c ≤ real cost `[MED]` | Low |
| Drivers cannot set a price | Met | `costMode` preference only; amounts computed (`src/lib/pools/tally.ts`) | — |
| Label "contribution to costs, not a fare" | Partial | Copy says "owes" (`en.ts:404-406`), which reads as a debt | Low |
| Terms and declaration: no insurance provided; driver's motor liability covers passengers `[MED]` | Partial | Insurance clause is a placeholder (`en.ts:632`) | Medium |

### 2.5 Data subject rights

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| Export: JSON + HTML/PDF, async, signed link | Partial | Synchronous JSON download (`src/app/api/me/export/route.ts`). Omits audit rows where the user is the target (`src/lib/gdpr.ts:81` filters on actor only). Suspended users cannot export | Medium |
| Rectification | Partial | Profile, home, schedule editable; email not | Low |
| Erasure within 30 days, crypto-shred, email confirmation | Partial | Immediate hard delete (`gdpr.ts:11-44`), no confirmation email, no backup path. Leaves geocode cache rows keyed by typed address (`gdpr.ts:40-43` vs `src/lib/geo/provider.ts:37`) and `pwreset:<email>` tokens (`gdpr.ts:34` vs `src/lib/password-reset.ts:8`); the test seeds an identifier the code never writes (`legal.db.test.ts:144`) | High |
| Consent withdrawal and objection toggles | Partial | Withdrawal works; objection is by email | Low |
| Data access log (admin reads, with reason) | Missing | Admin reads are not logged; `audit.ts` covers writes | High |
| Privacy and DPO contact, GBA/APD complaint | Partial | On `/privacy` only, as env placeholders | Low |

### 2.6 Retention

| Data | Brief | Current | Severity |
|---|---|---|---|
| Account profile | 30 days after closure or leaving BSB | Immediate on request; no leaver or inactivity purge | Medium |
| Exact home address | Encrypted, account lifetime | Plaintext, account lifetime | High (see 4.5) |
| Trip records | 12 months, then anonymised | Anonymised 365 days after the *pool ends* (`src/lib/retention.ts:25-37`); long-running pools stay identified | Medium |
| Trip messages | 90 days unless under report | Deleted 30 days after the pool ends; active-pool chat kept indefinitely; no report hold (`retention.ts:14,57`) | Medium |
| Safeguarding records | `{{SAFEGUARDING_RETENTION}}` | Resolved reports deleted after 365 days; cascade on account deletion | High |
| Consent records | Account lifetime + 3 years `[MED]` | Cascade-deleted with the account (`schema.prisma:206`) | Medium |
| Audit logs | 12 months; access log 24 months | 365 days; no access log | Low |
| Backups | 30-day rolling, stated in notice | `scripts/backup.sh` covers local SQLite only; nothing for Netlify Postgres; the notice claims 30 days anyway (`en.ts:591`) | High |
| `docs/RETENTION.md`, configurable values, logged runs | Missing | Constants in `retention.ts:7-20`; run results only in function logs | Low |

### 2.7 Third parties and data residency

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| All personal data in the EU/EEA | **Conflict** | Hosting on Netlify (US company, function region not set in repo `[MED]`); database Netlify DB / Neon (US company, region unknown `[LOW]`); SMS via Twilio (US `[HIGH]`) | Critical: confirm regions and contracts |
| Subprocessor list current and linked | Partial | `docs/legal/SUBPROCESSORS.md` omits Netlify, Neon and Twilio; not linked from the notice | Medium |
| Geocoder self-hosted or EU | Partial | Public Photon (komoot, DE `[MED]`) and public Nominatim (OSMF, UK `[HIGH]`) | Medium |
| Routing | Partial | Exact home coordinates sent to the public OSRM demo server (`provider.ts:235-241`), against its usage policy | High |
| Map tiles self-hosted or EU | Missing | Browser loads `tile.openstreetmap.org` (OSMF UK, Fastly CDN `[MED]`) at street zoom around the home (`src/components/leaflet-base.ts:6`) | High |
| No Google Maps JS | Met with caveat | No JS. A "public transport" deep link carries exact home coordinates to Google on tap (`src/lib/pools/daily.ts:238-240`) | Medium |
| No analytics, crash reporting, trackers | Met | None; CSP `connect-src 'self'` | — |
| Email: EU provider, no locations in emails | Partial | Provider not chosen. Digest subject carries the meeting-point label (`en.ts:445`); names in subjects (`en.ts:462`) | Medium |
| Push payloads without personal data | P2 | No Web Push | — |

### 2.8 Cookies and storage

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| Strictly necessary only | Met | Auth.js session, CSRF and callback cookies; localStorage `installDismissed` only (`src/components/pwa-setup.tsx:22`) | — |
| Cookie notice documenting each item | Missing | Notice mentions only "the sign-in cookie" (`en.ts:610`) | Low |

### 2.9 Accessibility

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| WCAG 2.2 AA | Partial | axe (WCAG 2.0/2.1 A/AA) on signed-out, member and onboarding pages in light and dark (`e2e/a11y.spec.ts`); skip link; visible focus. Not scanned: admin, `/trips/[id]`, `/survey`, `/profile`, `/signin/new`, `/signin/forgot`; no `wcag22aa` tag; no 200% or keyboard-only tests | Medium |

### 2.10 Native app stores

Not applicable: PWA only. In-app deletion already exists.

### 3. Legal content

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| Versioned Markdown in `/legal` with version, date, sha256 | Missing | Text lives in `src/i18n/en.ts:528-660`; version is free text typed by an admin | Medium |
| Acceptance record `(user, doc, version, sha256, time)` | Partial | `Consent` records two scopes; terms, code of conduct and driver declaration never recorded | Medium |
| Material change forces re-acceptance | Partial | Re-gate on `policyVersion` change (`src/app/(app)/layout.tsx:15`); manual; untested | Medium |
| Privacy notice accurate, shown before account creation | Partial | `/signin/new` collects email, password and phone with no privacy link. Notice is **factually wrong**: says "there are no passwords" (`en.ts:610`); says geocode cache rows are deleted with the account (they are not); claims 30-day backups (none exist for production) | High |
| Phone purpose | Partial | Sign-up says the phone is "used only" for reset codes (`en.ts:96`); it is also shown to every pool member (`src/app/(app)/pools/[id]/page.tsx:78-80`) and sent to Twilio (US) | Medium |
| Terms, code of conduct, driver declaration, safety/SOS, location-sharing, cookie, accessibility, imprint | Partial / Missing | Terms are a DRAFT, not recorded; others absent or placeholders | Medium |

### 4.1–4.3 Identity, sessions, authorisation

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| SSO via BSB's IdP (OIDC); leavers lose access | **Conflict** | Email + password for everyone (`src/lib/auth.ts:109`) | Critical: root cause of P0-1 and P0-3 |
| `PassVerifier`, HMAC of pass id, termly re-verify | Missing | — | High |
| Admin MFA (phishing-resistant), separate subdomain | Missing | Admin is password-only under `/admin` | Critical |
| No passwords except one Argon2id break-glass | Conflict | scrypt with Node defaults (N=16384), below OWASP's scrypt minimum (`src/lib/password.ts:14`); 8-character minimum; `OWNER_PASSWORD` compared in plaintext from env (`auth.ts:77`) | High |
| Step-up re-authentication for sensitive actions | Missing | Delete needs only typing "DELETE"; export and address change none | Medium |
| Server-side opaque sessions, `__Host-` cookie | Conflict | JWT strategy (`src/lib/auth.config.ts:6`); cookie `__Secure-authjs.session-token`; `Session` table unused | Medium |
| Rotation; admin idle 15 min; 30 days max; revoke on suspension and credential change | Partial | Status re-read per request (good). No admin idle timeout; JWT slides; password reset and admin set-password leave old sessions valid | High |
| CSRF on state changes | Partial | Next server-action origin check and Auth.js double-submit token (built-in) | Low |
| Deny by default; object-level checks | Partial | Every server action authenticates and checks the object; verified for pools, trips, requests, matches, reports, admin (org-scoped). `/dev/` is on the public list but returns 404 outside development | Medium: only 2 roles; no regression tests |
| Postgres RLS on every personal-data table | Missing | Schema created with `prisma db push` | Medium |
| Least-privilege DB role, separate migration role | Missing | One connection string for app and schema push | Medium |
| Random UUID ids | Partial | `cuid()` (timestamp + counter) | Low |
| Admin access to personal data needs a typed reason, logged, visible to the user | Missing | — | Medium |
| **Enumeration** | Partial | Distinct `suspended`, `noAccount`, `exists`, `noPhone` answers (`signin/actions.ts:31-39,85`, `auth.ts:44-45`). This is what makes P0-1 easy to find | Medium |
| **Break-glass owner** | — | `ownerLogin` silently resets the owner row to ADMIN/ACTIVE on each login (`auth.ts:81-82`), so admins cannot suspend it | Medium |

### 4.4 Encryption in transit

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| HSTS ≥ 1 year, includeSubDomains, preload | Partial | 180 days, no includeSubDomains or preload, emitted only if `AUTH_URL` is https at build time (`next.config.ts:4,17`) | Medium |
| DB and SMTP over verified TLS | Partial | `sslmode` not enforced (`src/lib/db.ts:12-13`); `SMTP_SECURE` defaults false, no `requireTLS` | Medium |

### 4.5 Encryption at rest

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| Field encryption (address, coordinates, phone, report text, messages), per-user DEK, KEK in EU KMS, AAD, rotation, crypto-shredding, blind index | Missing | No crypto code anywhere; all plaintext | High (Critical before minors) |
| Infrastructure encryption and encrypted backups | Not evidenced | Provider-managed on Netlify DB; local `backup.sh` copies are unencrypted | Medium |

### 4.6 Location and address privacy

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| Matching on a coarse cell (H3 res 8), never the exact address | **Conflict** | Engine and routing use exact `homeLat/homeLng` (`src/lib/matching-service.ts:63`); 500 m grid is display-only (`src/lib/geo/approx.ts`) | High |
| Before acceptance: rounded distance only | Partial | No address or coordinates sent; per-day pickup times and detour hint at proximity | Low |
| After acceptance: agreed pickup point; address sharing opt-in | **Conflict** | Pool page sends every member's exact home to all members' browsers (`pools/[id]/page.tsx:45-55,260-263`); pickup defaults to the door; only the driver sets meeting points; address sharing bundled into the mandatory consent | High |
| Live location per trip, opt-in | Missing | Not built; nothing leaks | Medium (SOS depends on it) |
| Admin heat map | Partial | Only aggregated cells (≥3 homes) reach the browser; but includes users who never gave or withdrew location consent (`src/lib/admin/metrics.ts:189`) | Medium |

### 4.7 API hardening

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| Schema validation, size limits, parameterised queries | Partial | Zod on actions; no raw SQL; default 1 MB body limit | Low |
| Rate limits per IP and account (login, matching, messaging, export, SOS) | Partial | See P0-2; exports unlimited | High |
| Security headers | Partial | Script nonce + `strict-dynamic` (good); `style-src 'unsafe-inline'`; `Referrer-Policy: strict-origin-when-cross-origin` (deliberate, for tiles); `geolocation=()` will block SOS | Low |
| CORS allowlist | Met (implicit) | No CORS headers | — |
| Uploads: re-encode, EXIF strip, private bucket | Partial | EXIF stripped, 200 KB cap; stored as data URL in the DB, not re-encoded | Low |

### 4.8 Secrets and supply chain

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| `.env` ignored, `.env.example` committed | Met | `.gitignore`; dev `AUTH_SECRET` refused in production (`src/lib/env.ts:62-68`) | — |
| gitleaks hook and CI | Missing | No `.github/`, no hooks | Medium |
| Lockfile + `npm ci` + Dependabot/Renovate | Partial | Lockfile tracked; no CI, no update bot | Medium |
| CI gates: dependency scan, SAST, secret scan, ZAP | Missing | No CI | Medium |
| SBOM | Missing | — | Low |
| **Destructive deploy** | — | Every production deploy runs `prisma db push --accept-data-loss` (`scripts/netlify-build.sh:19`) | Medium: switch to `migrate deploy` |

### 4.9 Logging, audit, monitoring

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| Structured JSON logs, request ids, PII redaction, PII test | Missing | Ad-hoc `console.*`. In production, phone numbers can reach function logs via Twilio errors (`src/app/signin/actions.ts:87`), recipient addresses via SMTP errors (`src/lib/notify.ts:49`), and `ADMIN_EMAILS` are printed in every build log (`prisma/seed.ts:67`) | Medium |
| Audit log contents | Partial | Admin writes, admin export, self-delete. Not logged: login, failed login, admin reads, legal acceptance, user export, report creation. Consent changes deliberately not logged (`src/lib/consent.ts:4-8`) | High |
| Append-only, hash-chained | Missing | Plain table, rows purged by retention | Medium |
| Alerts | Missing | — | Medium |

### 4.10–4.11 Infrastructure, recovery, incidents

| Requirement | Status | Evidence | Severity |
|---|---|---|---|
| Private DB network, separate dev/staging/prod | Partial | No staging; production schema pushed from the build | Medium |
| Synthetic seeder; no real data in dev | Met | `prisma/seed.ts` (faker, `isSeed`, `--purge`) | — |
| Daily encrypted EU backups, quarterly restore test, `docs/DR_TESTS.md` | Missing | Only local SQLite copies | High |
| `docker compose` dev with no external services | Partial | Mailpit only; dev calls public Photon, Nominatim, OSRM, OSM tiles | Low |
| `docs/INCIDENT_RESPONSE.md` (24 h processor, 72 h Art. 33) | Missing | — | High |

### 5. SOS

Missing entirely: no control, no 112 handoff, no emergency contacts, no incident model, no deletion freeze, no retry. Scored **Critical per the brief**, but there is no trip-time feature today for it to protect; it depends on live location (4.6) and the incident record (4.9). Build order in section 5 below.

### 6. Required tests

| Test | Status |
|---|---|
| Generated authorisation matrix (role × endpoint × own/other/child) | Missing (hand-picked cases only) |
| Safeguarding R1–R9 incl. property-based | Missing |
| Crypto round-trip, tamper, AAD swap, nonce, rotation, shredding | Missing (no crypto) |
| RLS migration test | Missing |
| PII-in-logs | Missing |
| Retention with time travel | Partial (`src/lib/__tests__/legal.db.test.ts:194-261`) |
| Export and deletion | Partial (misses geocode keys and reset tokens) |
| Legal re-acceptance | Missing |

## 3. What is already sound

- Object-level authorisation on every server action and route handler (pools, trips, requests, matches, reports, blocks, admin), verified by reading each one.
- Suspension takes effect on the next request (status re-read each time).
- `/dev` routes return 404 in production builds whatever `PILOT_MODE` says.
- No analytics, trackers or third-party scripts; fonts self-hosted; strict script CSP with nonces.
- Match cards never carry addresses or coordinates (covered by `legal.db.test.ts:373-386`).
- Admin heat map aggregates server-side and suppresses cells with fewer than 3 homes.
- Synthetic seeder separated from real data.

## 4. Design conflicts that need a decision before code

These cannot be "fixed"; the brief and the existing design disagree. The brief says to stop and ask.

| # | Conflict | Current | Brief | Decision owner |
|---|---|---|---|---|
| D1 | Authentication | Email + password, SMS reset via Twilio | OIDC SSO via BSB's IdP; no passwords | School IT: which IdP (Entra ID or Google Workspace) and will they register an app? |
| D2 | Interim P0 fix if SSO is not available soon | — | — | Developer: emailed one-time code at sign-up (needs SMTP on Netlify) or admin-only account activation |
| D3 | Hosting and data residency | Netlify (US) + Neon (region unknown) + Twilio (US) | EU/EEA only, EU-headquartered preferred | School: hosting provider and region |
| D4 | Location model | Exact-home routing; door pickup by default; exact homes visible to pool members | H3 cell matching; meeting point by default; address sharing opt-in | Developer + school: accept a less precise detour estimate |
| D5 | Fields outside the 2.1 table | Gender (same-gender matching), languages, preferences, research survey, phone shown to pool | Not allowed without updating the table | Controller |
| D6 | Legal basis for matching | Consent | Art. 6(1)(b) | Controller |
| D7 | Suspension behaviour | Pools kept by design | Cancel future trips, notify co-riders | Developer (low risk to change) |
| D8 | Phase 2 scope | "No minors anywhere" (`docs/BRIEF.md` §9.1) | Students and parents, controls behind a flag now | School safeguarding lead |

Open decisions from brief section 8 remain as placeholders: controller identity and DPO, legal bases, R3, minimum student age, safeguarding retention, IdP and pass verification, hosting region, cost-share display and cap, languages, DPA signatory.

## 5. Proposed order

Brief section 9 order, with the P0 fixes pulled forward because they are live.

| Step | Work | Blocked on |
|---|---|---|
| 0 | P0-1, P0-2, P0-3: close account claiming, move rate limiting into `authorize()` with a shared store, require mailbox proof at sign-up; remove enumeration; revoke sessions on credential change | D2 |
| 1 | This report, threat model, data map | — (done) |
| 2 | Crypto module (envelope encryption, blind index) with tests | Hosting KMS (D3); a local KEK works meanwhile |
| 3 | SSO, server-side sessions, admin MFA, pass verification | D1 |
| 4 | Role model, authorisation matrix test, Postgres RLS, least-privilege role, `migrate deploy` | D3 for RLS on the production database |
| 5 | Safeguarding policy module; R7, R8, R9 now; R1–R6 behind the Phase 2 flag | D8 for R3 |
| 6 | H3 matching, meeting points, address opt-in | D4 |
| 7 | SOS | Steps 5, 6, 10 |
| 8 | `/legal` versioned documents and acceptance records | — |
| 9 | "Your data" page: async export, deletion fixes, access log | Steps 2, 10 |
| 10 | Structured logging with redaction, hash-chained audit, alerts | — |
| 11 | Retention jobs to the brief's schedule | Safeguarding retention value |
| 12 | CI gates | — |
| 13 | Draft legal and compliance documents | — |
