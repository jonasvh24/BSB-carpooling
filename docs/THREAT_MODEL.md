# Threat model

> Status: working document, 2026-10-14, describing the code at commit `75c3f9b` and the controls the legal, safeguarding and security brief requires. Gap references (P0-1, D3 …) point to `docs/COMPLIANCE_GAP_REPORT.md`. Revisit at every phase change, and before Phase 2 (minors) in particular.

## 1. System

```
 Browser (PWA) ──HTTPS──▶ Netlify edge ──▶ Next.js server (functions) ──▶ Netlify DB (Postgres, Neon)
     │                                      │   │   │
     │ tiles                                │   │   └─▶ SMTP provider (email)
     ▼                                      │   └─────▶ Twilio (SMS reset codes)
 tile.openstreetmap.org                     └─────────▶ Photon / Nominatim / OSRM (geo)
                                Netlify scheduled functions ──▶ /api/jobs (JOBS_SECRET)
```

Single organisation (BSB), one site (Tervuren campus). Phase 1 users: staff and admins. Phase 2 adds students, parents and a safeguarding lead.

## 2. Assets

| Asset | Why it matters | Where it lives today |
|---|---|---|
| Home address and exact coordinates | Locates a person's home; stalking and burglary risk; for minors, a safeguarding risk | `User.homeAddress/homeLat/homeLng` plaintext; geocode cache; trip route JSON; pool-page HTML |
| Schedule (days, arrival and departure times) | Combined with home: predicts when a house is empty and where a person will be | `ScheduleEntry`, `Match.details`, digest emails |
| Identity and contact (name, email, phone, photo) | Impersonation, phishing, harassment | `User` plaintext; phone shown to pool members |
| Chat and report text | Harassment evidence; may contain special-category data | `Message.body`, `Report.details` plaintext |
| Admin capability | Reads everyone's data, suspends, sets passwords, exports CSVs | `role = ADMIN` |
| Credentials and sessions | Account takeover | scrypt hashes; JWT cookies; `OWNER_PASSWORD` env; `AUTH_SECRET` |
| Safeguarding records (reports, suspensions, future SOS incidents) | Evidence for the school; must survive the reported person's actions | `Report`, `AuditLog` |
| Phase 2: minors' data and parent links | Highest harm; legal duty of care | Not built |
| Availability of trip coordination | People rely on it to get to work | Netlify + Neon |

## 3. Actors

| Actor | Capability | Motivation |
|---|---|---|
| Anonymous internet user | Reaches public pages, `/api/auth/*`, sign-up | Account takeover, data harvesting |
| Malicious adult member | Valid account, can be matched, pooled, chat; sees co-members' homes and phones | Locate or contact a colleague (or, in Phase 2, a pupil) |
| Impostor | Registers a colleague's address before they do (P0-3) | Impersonation, access to matching data |
| Curious or compromised admin | Full org data through admin pages and exports | Snooping; coerced disclosure |
| Former member or leaver | Still holds a password and a 30-day JWT | Continued access after leaving BSB |
| Stolen or unlocked phone | Holds a valid session cookie | Read chat, homes, export the victim's data, delete the account |
| Compromised dependency | Code execution in build or server | Exfiltrate the database or secrets |
| Compromised third party (geo, tiles, SMS, SMTP, host) | Sees what is sent to it | Profiling, disclosure |
| Operator error | Deploys, schema changes, env edits | Data loss (`db push --accept-data-loss`), secrets in logs |

## 4. Trust boundaries

| # | Boundary | Crossing data | Current control |
|---|---|---|---|
| B1 | Browser → server | Credentials, all user input | HTTPS; Zod validation; server-action origin check; Auth.js CSRF token |
| B2 | Signed-out → signed-in | Email + password | Domain allowlist / invitation; **no mailbox proof**; rate limit bypassable |
| B3 | Member → admin | Role flag | `requireAdmin` per page and action; no MFA, no step-up, no access log |
| B4 | Member → other member | Profiles, homes, phones, chat | Object checks per pool/trip; exact homes shared inside a pool |
| B5 | Server → database | Everything | Single connection string, full privileges, no RLS, `sslmode` not enforced |
| B6 | Server → geo providers | Typed addresses, exact coordinates | Server-side calls; cached; public instances |
| B7 | Browser → tile server | IP + home neighbourhood | None (direct load) |
| B8 | Server → SMS / SMTP | Phone, email, names, meeting points | Provider credentials in env |
| B9 | Scheduler → `/api/jobs` | Job trigger | Constant-time `JOBS_SECRET`; 404 when unset |
| B10 | Developer machine → production | Deploys, env, schema | Netlify build from `main`; no staging; no CI |

## 5. Threats and mitigations

Status: **In place**, **Partial**, **Gap**. Priority follows the gap report.

### Spoofing and account takeover

| Threat | Actor | Status | Current | Required (brief ref) |
|---|---|---|---|---|
| Claim a password-less account (admins, owner) by "signing up" | Anonymous | **Gap, P0-1** | Claim branch skips every check | Never claim by sign-up; mailbox proof; SSO (4.1) |
| Register a colleague's address | Impostor | **Gap, P0-3** | `emailVerified` set on trust | Mailbox proof now; SSO later (4.1) |
| Online password guessing via `/api/auth/callback/credentials` | Anonymous | **Gap, P0-2** | Limit only in the server action; in-memory per instance | Limit inside `authorize()` with a shared store; lockout with backoff (4.7) |
| Guess `OWNER_PASSWORD` | Anonymous | Gap | Plaintext env compare, no MFA | Remove or hash with Argon2id plus MFA (4.1) |
| Enumerate accounts and their state | Anonymous | Gap | Distinct error messages | Generic answers (4.7) |
| Leaver keeps access | Former member | Gap | Nothing ties the account to employment | SSO; termly pass re-verification (4.1) |
| Stolen session survives password reset | Stolen phone | Gap | JWT valid 30 days, sliding | Server-side sessions, revoke on credential change (4.2) |
| SMS reset code brute force | Anonymous | Partial | 6 digits, 5 tries per 10 min per instance | Shared-store limit; salted hash; check account status |

### Tampering

| Threat | Actor | Status | Current | Required |
|---|---|---|---|---|
| Modify another user's pool, trip or meeting point | Malicious member | In place | Object checks verified on every action | Generated authorisation-matrix test to keep it so (6) |
| Alter audit history | Admin, operator | Gap | Plain table, rows purged | Append-only, hash-chained (4.9) |
| Destructive schema change on deploy | Operator | Gap | `prisma db push --accept-data-loss` in the build | `prisma migrate deploy` under a migration role (4.3) |
| Swap ciphertext between rows | Database attacker | N/A today | No encryption | AES-GCM with AAD `(table, column, row_id, key_version)` (4.5) |

### Repudiation

| Threat | Status | Current | Required |
|---|---|---|---|
| Reported person deletes their account and the report disappears | **Gap** | `Report` cascades on either user | Keep reports and linked messages on account deletion; pseudonymise (2.3 R9, 2.6) |
| Admin reads data with no trace | Gap | Reads not logged | Typed reason, audit entry, user-visible access log (4.3, 2.5) |
| Consent given or withdrawn with no proof | Gap | Consent rows cascade on deletion; changes not audited | Immutable consent records kept for account lifetime + 3 years `[MED]` (2.2, 2.6) |

### Information disclosure

| Threat | Actor | Status | Current | Required |
|---|---|---|---|---|
| Exact homes of all pool members sent to every member's browser | Malicious member | Gap | Pool map and meeting-point editor | Meeting point by default; address opt-in (4.6) |
| Proximity inferred from match details | Malicious member | Partial | Times and detour shown, no coordinates | Rounded distance only (4.6) |
| Phone shown to pool members though sign-up says "used only for reset codes" | Member | Gap | Phone rendered on pool page | Separate, opt-in contact field (2.1) |
| Former pool members still listed for reports | Former member | Gap | Report page has no ACTIVE filter | Filter on active membership |
| Database dump exposes everything | Compromised dependency, host | Gap | All plaintext | Field encryption with per-user DEKs (4.5) |
| Home neighbourhood leaked to tile CDN | Third party | Gap | Direct OSM tile loads | Self-hosted or EU tiles (2.7) |
| Exact homes sent to the public OSRM demo | Third party | Gap | Public demo server | Self-hosted router (2.7) |
| Data outside the EEA | Third party | **Gap, D3** | Netlify, Neon, Twilio | EU hosting, EU SMS/email (2.7) |
| PII in production logs | Operator, log processor | Gap | Twilio and SMTP error text; admin emails in build log | Redaction middleware + test (4.9) |
| Meeting point and names in email subjects | Mail provider | Partial | Digest subject | Neutral subjects; details behind sign-in (2.7) |
| Dev login reachable through a tunnel | Anonymous | Partial | 404 in production builds; open if `npm run dev` is tunnelled without `PILOT_MODE=true` | Remove the tunnel path or bind dev routes to localhost |

### Denial of service

| Threat | Status | Current | Required |
|---|---|---|---|
| Sign-up or message flooding | Partial | In-memory limits per instance | Shared-store limits (4.7) |
| Geo provider quota exhaustion | Partial | Cache; OSRM spacing optional | Self-hosted geo (2.7) |
| SOS blocked by rate limiting (future) | N/A | — | Never rate-limit SOS into failure (5) |

### Elevation of privilege

| Threat | Actor | Status | Current | Required |
|---|---|---|---|---|
| Become admin via `ADMIN_EMAILS` claim | Anonymous | **Gap, P0-1** | See above | See above |
| Admin compromised by phishing | Admin | Gap | Password only | Phishing-resistant MFA, separate subdomain, 15-min idle (4.1, 4.2) |
| Suspended owner restores itself | Compromised owner | Gap | `ownerLogin` resets role and status | Honour suspension; owner as a normal hashed account |
| App role alters schema or reads all rows | Compromised dependency | Gap | Full-privilege DB role | Least-privilege role; RLS (4.3) |
| Phase 2: adult reaches a minor | Malicious adult member | N/A today | No minors | Safeguarding module R1–R9 before any student account (2.3) |

## 6. Residual risk after the brief is implemented

| Risk | Why it remains |
|---|---|
| A vetted adult in an accepted carpool learns where a colleague lives | Inherent to carpooling; reduced by meeting points and address opt-in |
| Coerced or careless admin | Reduced by access logging and reasons, not eliminated |
| Driver competence and vehicle safety | Self-declared; the app does not check licences or insurance by design |
| Provider breach in the EU | Contracts and field encryption limit impact |
