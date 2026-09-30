# Outbound data flows and third parties

Status: working document, not legal advice. Built by searching the code for every `fetch`, HTTP client, SMTP call, tile URL and third-party script (command and output summarised at the end). Provider facts that come from the providers' own published policies are tagged `[MED]` or `[LOW]` because they were written from memory and must be re-read at the source before launch; the links to check are listed per provider.

Whether each party is a processor, a separate controller or neither is a legal classification and is asked in `LAWYER_QUESTIONS.md` (Q5). None of them has a contract with the operator today.

## Summary

| # | Provider | Reached from | What leaves | Identity attached | Pilot (40 staff) | Commercial use |
|---|---|---|---|---|---|---|
| 1 | Photon (komoot) | server | address text typed by the user, the school's coordinates | none (server IP, configured User-Agent) | tolerated under fair use `[MED]` | not acceptable on the public instance; self-host |
| 2 | Nominatim (OpenStreetMap Foundation) | server | exact pin coordinates | none | allowed within 1 request per second `[MED]` | not acceptable on the public instance at any volume that matters; self-host or paid provider |
| 3 | OSRM demo server (FOSSGIS) | server | pairs and chains of exact home coordinates plus the school | none | **breaches the usage policy as built**: a cold recompute sends hundreds of requests in seconds `[MED]` | not acceptable; self-host |
| 4 | OpenStreetMap tile servers | the user's browser | the user's IP address, the app URL as referrer origin, and which map tiles are loaded (the area around the home at street zoom) | IP address | allowed with attribution `[MED]` | allowed in principle but without any guarantee; heavy use must move to a paid or self-hosted tile service `[MED]` |
| 5 | SMTP provider (not chosen) | server | recipient email address, names of colleagues in subject lines, pickup times and place labels, magic links | email address | depends on the provider | needs a data processing agreement |
| 6 | Cloudflare quick tunnel (`npm run tunnel`) | all traffic | everything: every page, including home addresses, phone numbers, chat and session cookies, passes through Cloudflare in the clear after TLS is terminated at their edge `[MED]` | IP address and full content | **not suitable**: quick tunnels are offered for testing without an account, contract or uptime commitment `[MED]` | not acceptable; use a named tunnel under a Cloudflare account with its data processing addendum, or host the app |
| 7 | Google Maps (transit link) | the user's browser, only when the user taps "Public transport options" | exact home coordinates and the school coordinates in the URL | whatever Google knows about the browser | user-initiated; disclose in the notice | same |
| 8 | Google Fonts | nobody at runtime | nothing: `next/font` downloads Open Sans at build time and serves it from the app | none | fine | fine |

## Detail and evidence

### 1. Photon — address type-ahead

- Code: `` `src/lib/geo/provider.ts:40` ⟨const url = new URL("/api/", env.PHOTON_URL);⟩ ``. Called from `` `src/app/api/geo/search/route.ts:14` ⟨const hits = await geocode(q, site ?? undefined);⟩ `` after the session check and a rate limit of 60 per minute per user.
- Data: the query text (what the user has typed so far, lower-cased), `limit`, `lang`, and the latitude and longitude of the organisation's first active site as a location bias. The request comes from the server, so Photon sees the server's IP address and the `GEO_USER_AGENT` string, not the user's.
- Default endpoint `https://photon.komoot.io`, operated by komoot GmbH, Germany `[MED]`.
- Terms: the public instance is provided free under a fair-use statement; extensive use may be throttled or blocked; no service level `[MED]`. Check: photon.komoot.io landing page.
- Configurable: `PHOTON_URL`.

### 2. Nominatim — reverse geocoding when the pin is dragged

- Code: `` `src/lib/geo/provider.ts:78` ⟨const url = new URL("/reverse", env.NOMINATIM_URL);⟩ ``, serialised to one request per 1.1 seconds by `` `src/lib/geo/provider.ts:66` ⟨function throttledNominatim⟩ ``; rate limit 20 per minute per user in `` `src/app/api/geo/reverse/route.ts:12` ⟨rateLimit(`rev:${user.id}`, 20, 60_000)⟩ ``.
- Data: latitude and longitude of the dragged pin at full precision, zoom 18.
- Default endpoint `https://nominatim.openstreetmap.org`, run by the OpenStreetMap Foundation (a UK company) `[MED]`.
- Terms: Nominatim Usage Policy: at most one request per second, an identifying User-Agent or Referer, no auto-complete, results should be cached; the policy discourages systematic or heavy use and may withdraw access `[MED]`. Check: operations.osmfoundation.org/policies/nominatim.
- Configurable: `NOMINATIM_URL`, `GEO_USER_AGENT`.

### 3. OSRM — driving times and distances

- Code: `` `src/lib/geo/provider.ts:106` ⟨const url = new URL(`/route/v1/driving/${coords}`, env.OSRM_URL);⟩ ``.
- Data: ordered coordinate lists at full precision: driver home, passenger homes or meeting points, school. No names. A full recompute for 40 seeded staff made 344 route calls in about four seconds with a cold cache (measured on 2026-09-30, `npm run recompute`).
- Default endpoint `https://router.project-osrm.org`, the public demo server sponsored by FOSSGIS e.V., Germany `[MED]`.
- Terms: the demo server is for light, non-commercial testing; the published policy limits use to about one request per second and forbids heavy or commercial use `[MED]`. **The app has no throttle on OSRM calls**, so the nightly recompute and the first recompute after sign-ups exceed that limit. Check: github.com/Project-OSRM/osrm-backend/wiki/Api-usage-policy.
- Configurable: `OSRM_URL`. Fallback when unreachable: straight-line estimate, no data leaves.

### 4. Map tiles

- Code: the three map components load tiles straight from the browser: `` `src/components/onboarding/home-map.tsx:39` ⟨url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"⟩ ``, `` `src/components/pool-map.tsx:24` ⟨<TileLayer attribution=⟩ ``, `` `src/components/heat-map.tsx:16` ⟨<TileLayer attribution=⟩ ``.
- Data: the browser requests tile images, so the tile servers receive the user's IP address, browser headers and the tile coordinates. On the home step the map is centred on the user's home at zoom 16, so the tiles requested reveal the neighbourhood.
- Operator: OpenStreetMap Foundation; tiles are delivered through a content delivery network (Fastly, a US company) `[MED]`.
- Terms: Tile Usage Policy: attribution required, no bulk downloading, a valid Referer, no guarantee of availability; commercial use is not forbidden but heavy users are expected to use another provider `[MED]`. Check: operations.osmfoundation.org/policies/tiles.
- As found the tile URL is hard-coded; see register M1.

### 5. SMTP

- Code: `` `src/lib/mail.ts:33` ⟨await getTransport().sendMail({ from: env.EMAIL_FROM, ...opts });⟩ ``. Senders: magic links (`` `src/lib/auth.ts:68` ⟨async sendVerificationRequest({ identifier, url })⟩ ``), notifications (`` `src/lib/notify.ts:41` ⟨async function sendEmailFor⟩ ``), invitations (`` `src/app/admin/actions.ts:43` ⟨await sendMail({ to: email, subject: content.title⟩ ``).
- Data: recipient address; subjects and bodies that can contain a colleague's name ("{name} wants to carpool"), pickup time and meeting-point label, trip dates; sign-in links.
- Provider: not chosen. `.env.example` points at a local Mailpit. The school's own mail server keeps the data with the school; a transactional provider is a new processor.

### 6. Tunnel

- Code: `` `scripts/tunnel.sh:10` ⟨exec cloudflared tunnel --url⟩ ``. Not run during this audit.
- Data: all HTTP traffic between staff phones and the laptop.
- Terms: Cloudflare describes account-less quick tunnels as a testing feature with no uptime guarantee `[MED]`; the terms that apply to them and whether a data processing addendum covers them is unverified `[LOW]`. Check: developers.cloudflare.com, "Quick Tunnels".

### 7. Google Maps transit link

- Code: `` `src/lib/pools/daily.ts:239` ⟨https://www.google.com/maps/dir/?api=1&origin=⟩ ``, rendered as an ordinary link on a cancelled trip (`` `src/app/(app)/trips/[id]/page.tsx:71` ⟨transitUrl(home, site)⟩ ``).
- Nothing is sent unless the user taps the link. When they do, their exact home coordinates are in the URL.

### 8. Fonts and scripts

- `` `src/app/layout.tsx:2` ⟨import { Open_Sans } from "next/font/google";⟩ `` self-hosts the font files; no request goes to Google at runtime `[HIGH]` (Next.js documented behaviour).
- No analytics, tag manager, CDN script or third-party embed exists in `src/` or `public/` (search below).

## Transfers outside the EEA

Whether any of the above is a restricted transfer, and on what mechanism, is a legal question (Q6). Facts for the lawyer: komoot and FOSSGIS are German `[MED]`; the OpenStreetMap Foundation is in the United Kingdom `[MED]`; its tile CDN and Cloudflare are US companies `[MED]`; Google is reached only by user action.

## How this list was built

```
grep -rnE "fetch\(|https?://" src public scripts prisma   (code files only)
grep -rnE "<script|googletagmanager|analytics|cdn\." src public
```

The first search returns only: the three geo endpoints in `src/lib/env.ts`, the three `fetch` calls in `src/lib/geo/provider.ts`, the two same-origin `fetch` calls in the home form, the tile URL in three components, the OpenStreetMap copyright link, the Google Maps transit URL, the service worker's same-origin fetches, the tunnel script and two development helper scripts. The second search returns nothing.
