# Licence inventory

Status: working document, not legal advice. Built on 2026-09-30 from the installed production dependency tree, reading the `license` field of every package's own `package.json`:

```
npm ls --omit=dev --all --parseable      → 79 package directories
```

Development-only packages (test runners, linters, type definitions, the accessibility checker) are not shipped to users and are out of scope, except where noted.

## Totals (production tree)

| Licence | Packages | Note |
|---|---|---|
| MIT | 45 | |
| Apache-2.0 | 17 | keep the NOTICE text if a bundle is redistributed `[MED]` |
| ISC | 6 | |
| BSD-2-Clause | 3 | includes Leaflet |
| BSD-3-Clause | 2 | |
| 0BSD | 1 | |
| MIT-0 | 1 | nodemailer; more permissive than MIT |
| **Hippocratic-2.1** | 2 | **flag**, see below |
| **LGPL-3.0-or-later** | 1 | **flag**, see below |
| **CC-BY-4.0** | 1 | **flag**, see below |

## Direct production dependencies

| Package | Version | Licence |
|---|---|---|
| @auth/prisma-adapter | 2.11.3 | ISC |
| @prisma/client | 6.19.3 | Apache-2.0 |
| date-fns | 4.4.0 | MIT |
| date-fns-tz | 3.2.0 | MIT |
| dotenv | 17.4.2 | BSD-2-Clause |
| leaflet | 1.9.4 | BSD-2-Clause |
| next | 16.3.5 | MIT |
| next-auth | 5.0.0-beta.32 | ISC |
| node-cron | 4.6.0 | ISC |
| nodemailer | 8.0.11 | MIT-0 |
| prisma | 6.19.3 | Apache-2.0 |
| react, react-dom | 19.2.8 | MIT |
| react-leaflet | 5.0.0 | **Hippocratic-2.1** |
| zod | 4.6.5 | MIT |

## Flagged (anything that is not MIT, ISC, BSD or Apache-2.0)

| Package | Licence | Why it matters | Action |
|---|---|---|---|
| `react-leaflet` 5.0.0 and `@react-leaflet/core` 3.0.0 | Hippocratic License 2.1 (confirmed in `node_modules/react-leaflet/LICENSE.md`) | Not an OSI-approved open-source licence. It makes the permission to use the software conditional on compliance with human-rights laws and principles and passes that condition on to anyone who receives the software `[MED]`. That is harmless for a school pilot but is the kind of term that customers' procurement and an acquirer's due diligence reject, and it cannot be relicensed by the operator. | Register L1. As found: GAP. Fix in Phase C: replace with plain Leaflet (BSD-2-Clause), which the app already ships. |
| `@img/sharp-libvips-darwin-arm64` 1.3.4 | LGPL-3.0-or-later | A prebuilt native library installed as an optional dependency of Next.js for image optimisation. The app does not call `next/image`. It is used unmodified and dynamically loaded, which is the ordinary LGPL-compliant way to use a library `[MED]`. The platform-specific package differs per machine (this is the macOS build). | None for the pilot. If the app is ever shipped as a packaged product (container image or installer), include the LGPL text and a pointer to the libvips source `[MED]`. |
| `caniuse-lite` | CC-BY-4.0 | Browser-support data used by build tools. Attribution licence for data, not code `[MED]`. | None; listed here as the attribution. |

## OpenStreetMap data (ODbL)

The maps, address search and routing all use OpenStreetMap data, which is licensed under the Open Database Licence 1.0 `[HIGH]`.

- **Attribution**: every map must show "© OpenStreetMap contributors" with a link to the copyright page `[HIGH]`. Present on all three maps: `` `src/components/onboarding/home-map.tsx:38` ⟨attribution=⟩ ``, `` `src/components/pool-map.tsx:24` ⟨attribution=⟩ ``, `` `src/components/heat-map.tsx:16` ⟨attribution=⟩ ``. See register P4 for the test.
- **Geocoding results**: storing the coordinates that a geocoder returned for a user's own address is generally treated as not creating a derived database that must be shared, but the OpenStreetMap Foundation's geocoding guideline is a community interpretation, not law `[LOW]`. Asked in `LAWYER_QUESTIONS.md`.
- **Routing results** (durations, distances, polylines) are produced works or insubstantial extracts in the usual reading `[LOW]`.
- The service terms of the hosted endpoints (who may call them and how often) are a separate matter from the data licence; see `SUBPROCESSORS.md`.

## The app's own code

No licence file exists in the repository and `package.json` has `"private": true`. Ownership of the code (author, employer, BV) is a non-code action: register M3.

## Fonts and images

- Open Sans is licensed under the SIL Open Font License 1.1 `[MED]`; it is self-hosted by `next/font`.
- The British School of Brussels logo (`src/components/brand-paths.ts`) is the school's trade mark and copyright. It is used on the pilot owner's statement that the school allows it; written permission is a checklist item and the logo must not ship to any other customer.
