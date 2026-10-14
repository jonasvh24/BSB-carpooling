# Data map

> Status: working document, 2026-10-14, built from `prisma/schema.prisma` at commit `75c3f9b` and the code that reads and writes it. Supersedes `docs/legal/DATA_MAP.md` (state as of 2026-09-30). Purposes refer to the table in section 2.1 of the legal, safeguarding and security brief.

Purpose codes: **AMV** account and membership verification · **RM** ride matching · **TC** trip coordination · **SAFE** safety, reports, abuse handling · **IMP** impact statistics · **—** not in the brief's table (needs a decision, see gap report D5).

**Storage: every field below is plaintext.** There is no application-level encryption. The brief requires field encryption for the rows marked ✱.

## Personal data by model

| Model.field | Data | Purpose | Shown to | Retention today |
|---|---|---|---|---|
| User.email | School email | AMV | Self, admins | Account lifetime |
| User.name | Name | AMV | Self, matched colleagues, pool members, admins | Account lifetime |
| User.passwordHash | scrypt hash | AMV | — | Account lifetime |
| User.phone ✱ | Mobile number | **—** (sign-up says reset codes only) | Self, **all pool members**, admins via export; sent to Twilio | Account lifetime |
| User.photoUrl | Photo (data URL) | **—** | Matched colleagues, pool members | Account lifetime |
| User.gender | Gender | **—** (same-gender matching) | Engine only | Account lifetime |
| User.homeAddress ✱ | Home address text | RM/TC | Self, pool members | Account lifetime |
| User.homeLat/homeLng ✱ | Exact home coordinates | RM (brief: never used for matching) | Self, **pool members' browsers**, routing provider | Account lifetime |
| User.approxLat/approxLng | ~500 m grid + offset | RM | Not rendered | Account lifetime |
| User.role, status | Role, suspension | AMV | Admins | Account lifetime |
| User.lastActiveAt | Activity time | **—** | Admin metrics | Account lifetime |
| Invitation.email | Invited address | AMV | Admins | Unused: 60 days; used: kept |
| CommuteProfile.rideRole, seats, detour, pickupStyle, walk, costMode | Preferences | RM | Engine; summary to matches | Account lifetime |
| CommuteProfile.vehicleDesc | Car description | **—** | Matched colleagues | Account lifetime |
| CommuteProfile.smoking, talk, music, genderPref, languages | Preferences, language | **—** | Engine; matched colleagues | Account lifetime |
| CommuteProfile.notes | Free text | **—** | Matched colleagues | Account lifetime |
| ScheduleEntry.* | Weekly days and times | RM | Engine; derived times to matches | Account lifetime |
| ScheduleException.date, kind, times | One-off changes | RM/TC | Engine | 90 days after the date |
| ScheduleException.note | Free text (can reveal health) | **—** | Self | 90 days after the date |
| SurveyResponse.answers | Research answers (cost, willingness to pay, free text) | **—** | Admins, aggregated | No rule: account lifetime |
| Consent.* | Scope, version, accepted/withdrawn | Supporting record | Self | **Deleted with the account** (brief: + 3 years) |
| Match.details | Derived pickup times from exact home | RM | Both parties | Regenerated nightly |
| PoolRequest.message | One-to-one free text | TC | Recipient | Closed requests: 90 days; pending: kept |
| Pool.name | Contains driver's name | TC | Members | No rule |
| PoolMember.pickupLat/Lng/Label, pickupTimes | Meeting point, times | TC | Members; label in email subjects | No rule |
| Trip.plannedRoute | Stop ids, times, home coordinates | TC | Participants | Route scrubbed after 30 days |
| Trip.distanceM, kmSaved | Distance | IMP | Admin aggregates | Anonymised 365 days after the pool ends |
| TripParticipant.status | Attendance, no-shows (feed a reliability figure) | TC | Matches see reliability | As trip |
| Message.body ✱ | Pool chat | TC | Pool members | 30 days after the pool ends; **deleted with the author** |
| Notification.title, body | May name colleagues | TC | Recipient | 90 days |
| Report.reason, details ✱ | Report about a third party | SAFE | Admins | Resolved: 365 days; **deleted if either party deletes their account** |
| Block.* | Who blocked whom | SAFE | Engine | No rule: account lifetime |
| GeoCache.key, value | Typed address prefixes; coordinates near homes | Processing cache | — | 7 days; GEOCODE rows **survive account deletion** |
| AuditLog.actorId, targetId, details | Admin actions; self-delete; trip thumbs-up | SAFE | Admins | 365 days |
| VerificationToken | `pwreset:<email>`, sha256 of the code | AMV | — | Until expiry; **survives account deletion** |
| Session, Account | Unused (JWT sessions, no OAuth) | — | — | — |

## Not present (brief fields for later phases)

Year group, linked parent, `is_adult` / age band, pass identifier (HMAC), `cleared_by_school`, emergency contacts, live location points, SOS incidents, legal-document acceptance records with sha256.

## Special-category data

No structured field. Free text can carry it: profile notes, schedule-exception notes, chat, report details, survey free text. Gender is not Art. 9 data but is outside the brief's table. `languages` can act as a weak proxy for origin.

## Outbound flows

| Recipient | Data | Location |
|---|---|---|
| Netlify (hosting, functions, logs) | All traffic | Netlify Inc., US `[HIGH]`; function region not set in the repo `[MED]` |
| Netlify DB / Neon | All stored data | Neon Inc., US `[HIGH]`; region to confirm in the console `[LOW]` |
| Twilio | Phone number, reset code | Twilio Inc., US `[HIGH]` |
| SMTP provider | Email, names, times, meeting-point labels | Not chosen |
| photon.komoot.io (server) | Typed address text, pin coordinates | komoot GmbH, DE `[MED]` |
| photon.komoot.io (browser, only when the server lookup fails) | Typed address text, pin coordinates, user IP | komoot GmbH, DE `[MED]` |
| geo.api.vlaanderen.be (server; browser when the server lookup fails) | Typed address text, pin coordinates; user IP on the browser path | Digitaal Vlaanderen (Flemish government), BE `[MED]` |
| nominatim.openstreetmap.org | Exact pin coordinates | OSMF, UK `[HIGH]` |
| router.project-osrm.org | Chains of exact home coordinates | FOSSGIS e.V., DE `[MED]` |
| tile.openstreetmap.org (from the browser) | User IP, home neighbourhood tiles | OSMF UK via Fastly CDN `[MED]` |
| google.com/maps (on tap) | Exact home and site coordinates | Google `[MED]` |
