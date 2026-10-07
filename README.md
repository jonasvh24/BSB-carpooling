# jvcarpool — BSB carpooling

**Public pilot URL (Cloudflare quick tunnel, changes when the tunnel restarts):**
https://roy-under-screw-spectacular.trycloudflare.com

Sign-in is open to `@britishschool.be` addresses (for example `012222@britishschool.be`)
and to anyone an administrator has invited. Accounts are email + password, created on
`/signin/new` without email confirmation. "Forgot your password?" texts a six-digit code
to the mobile number on the account (Twilio); administrators can also set a password
under Admin → Users.

Staff carpooling pilot (working title "Poolmate"). See `docs/BRIEF.md` for the specification, `CLAUDE.md` for stack and conventions, `docs/pilot-runbook.md` for running the pilot.

```
cp .env.example .env     # then edit
npm run setup
npm run dev              # http://localhost:3000
npm test
```

Development sign-in: `/dev` lists every user with a "login" link (no password needed). Notification
emails and password-reset text messages are printed to the console and shown at `/dev/mailbox`;
`docker compose up -d` starts Mailpit at http://localhost:8025 for the emails.

## Term dates

`prisma/term-dates/bsb-2026-2027.json` holds the school year's holidays (BSB holidays and public
holidays; PL days and induction days are staff working days). `npm run seed:terms` loads them into
the Holidays list for every organisation; it runs automatically on Netlify builds.

## Netlify

`netlify.toml` and `scripts/netlify-build.sh` deploy the same code with Postgres instead of SQLite
and Netlify scheduled functions (`netlify/functions/job-*.mts`) instead of in-process cron.

```
npx netlify login                      # once, opens the browser
npx netlify init                       # create the site, link this folder
npx netlify db init                    # free Postgres (Neon); sets DATABASE_URL
npx netlify env:set AUTH_SECRET "$(openssl rand -base64 32)"
npx netlify env:set AUTH_URL https://<site>.netlify.app
npx netlify env:set JOBS_SECRET "$(openssl rand -hex 24)"
npx netlify env:set ALLOWED_EMAIL_DOMAINS britishschool.be
npx netlify env:set PILOT_MODE true    # hides /dev; ORG_*, SITE_*, OWNER_*, TWILIO_* likewise
npx netlify deploy --build --prod
```


## Public URL

`npm run dev` on port 3100, then `PORT=3100 npm run tunnel` (cloudflared). Put the printed
`https://….trycloudflare.com` address in `AUTH_URL` in `.env`, restart the dev server and update
the URL at the top of this file. Until real SMTP is configured in `.env`, sign-in emails only land in
Mailpit, so colleagues cannot receive their link; the app now shows an error instead of
"Check your email" in that case.
