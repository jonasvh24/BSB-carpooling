# Pilot runbook

For the pilot owner. Six weeks, one school, one laptop. Everything below is from `docs/BRIEF.md` §14 with the exact commands.

## Before launch

1. **Configure `.env`** (copy from `.env.example`):
   - `ORG_NAME`, `ORG_HEADCOUNT` (total staff, used for the sign-up rate)
   - `SITE_NAME`, `SITE_ADDRESS`, `SITE_LAT`, `SITE_LNG` (find coordinates on openstreetmap.org: right-click → "Show address")
   - `ALLOWED_EMAIL_DOMAINS` (the school's email domain, e.g. `school.be`)
   - `ADMIN_EMAILS` (you and one colleague; these addresses may be outside the school domain)
   - `AUTH_SECRET` (`openssl rand -base64 32`)
   - SMTP settings for a real mailbox (the school's SMTP, or a transactional provider's SMTP credentials). Magic links and notifications go through this.
   - `GEO_USER_AGENT` with a contact address (OpenStreetMap policy)
   - `PILOT_MODE=true` — removes every development route and the dev mailbox.
2. `npm run setup` — installs, migrates, creates the organisation and site from `.env`, and seeds 40 demo staff.
3. **Remove the demo staff**: `npm run seed:purge`. Only real users remain. (Keep them for a rehearsal if you like; purge before the announcement.)
4. `npm run dev` in one terminal, `npm run tunnel` in another. Copy the `https://….trycloudflare.com` URL into `AUTH_URL` in `.env` and restart `npm run dev`. The laptop must stay on and awake (System Settings → Energy → prevent sleep). If that is a problem, the hosted option in the brief's §12 is about a day's work.
5. Sign in with an admin address and check `/admin`. Under **Sites** correct the bell times; under **Settings** check headcount, rates and thresholds.
6. Rehearse once end to end on your own phone: sign in, onboard, see matches (or the cold-start message), install to the home screen.

## Launch

7. **Invite staff**: `/admin/users` → paste the staff email list (one per line or comma separated). Each address is added to the allowlist and sent an invitation.
8. Post `docs/launch-announcement.md` in the staffroom and on the staff channel, with a QR code pointing at the tunnel URL (any free QR generator; print at A4).

## Week 1–2: density

9. Watch **Sign-up rate** and **Matchable** on `/admin` daily. The go/no-go panel colours them against the thresholds.
10. Nudge non-completers: the Monday 09:00 job emails "N colleagues joined near you" to everyone with a new neighbour. For a manual nudge, export users, filter `onboarded` empty, and email them.
11. If **Matchable** is below 30% after two weeks of sign-ups: stop the pilot, export everything (below) and report. Do not build habits on a market that is not there.

## Week 2: open pools

12. Pools are open by default. If matchable ≥ 30%, announce that requests can be sent, and ask drivers to accept promptly (requests expire after seven days).
13. Every evening at 18:00 the app creates tomorrow's trips and sends the digest. At 20:00 drivers are asked whether the trip happened. Check `/admin` → Behaviour weekly.

## Week 4

14. `/admin/surveys` → **Send week-4 survey**. Responses feed "Would recommend" on the dashboard.

## Week 6: close

15. `/admin/surveys` → **Send exit survey**.
16. Export everything from `/admin/users`: users, matches, trips, survey. They open in a spreadsheet.
17. Hold the go/no-go review against the panel on `/admin` and the thresholds in the brief §13.

## Every day

- **Backup**: `npm run backup` copies `prisma/dev.db` to `backups/` (keeps 30). Schedule it: `crontab -e` → `0 3 * * * cd /path/to/jvcarpool && bash scripts/backup.sh`.
- **Logs**: the `npm run dev` terminal prints `[cron] …` lines for each job and `[mail] …` for each email. If a job fails it says so.
- **Reports**: `/admin/reports` — resolve, or suspend the reported user.

## If something goes wrong

| Symptom | What to do |
|---|---|
| Nobody receives sign-in emails | Check SMTP settings in `.env`; the terminal shows `[mail] SMTP delivery failed`. |
| Tunnel URL changed after a restart | Update `AUTH_URL`, restart `npm run dev`, reprint the QR code. A named Cloudflare tunnel avoids this. |
| Times look wrong / "Times are estimates" everywhere | The public OSRM router is down; the app falls back to straight-line estimates. It recovers automatically; run **Recompute matches now** afterwards. |
| A user asks for their data or deletion | They can do both under Settings → Privacy. Admins can delete under Users. |
| Restore a backup | Stop the app, copy `backups/dev-….db` over `prisma/dev.db`, start again. |

## Reference

- Brief: `docs/BRIEF.md`. Decisions: `DECISIONS.md`. Per-phase notes: `CHANGELOG.md`.
- Privacy notice for staff: `/privacy` (edit `src/app/privacy/page.tsx`; bump **Privacy policy version** in `/admin/settings` to force re-consent).
