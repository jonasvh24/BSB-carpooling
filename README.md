# jvcarpool — BSB carpooling

**Live site:** https://bsb-carpooling.netlify.app (Netlify, Postgres, deploys from `main`)

Local preview through a Cloudflare quick tunnel still works (see "Public URL" below), but
the Netlify address is the one to share.

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

The site `bsb-carpooling` is linked to this GitHub repository: every push to `main` builds and
deploys on Netlify's servers, where the managed database is injected as `NETLIFY_DB_URL`
(`src/lib/db.ts` reads it). Builds must run there, not with `netlify deploy --build`, because the
database URL is not available locally. Environment variables live in the site settings
(`npx netlify env:list`); note Netlify reserves `SITE_NAME`, so the campus name is `SCHOOL_SITE_NAME`.
Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM` there to enable password-reset texts.

```
npx netlify login                      # once
npx netlify link --name bsb-carpooling # link a fresh checkout
npx netlify env:set NAME value --force # change a setting, then push or `netlify deploy --prod --trigger`
npx netlify logs --source functions    # runtime logs
```


## Public URL

`npm run dev` on port 3100, then `PORT=3100 npm run tunnel` (cloudflared). Put the printed
`https://….trycloudflare.com` address in `AUTH_URL` in `.env`, restart the dev server and update
the URL at the top of this file. Until real SMTP is configured in `.env`, sign-in emails only land in
Mailpit, so colleagues cannot receive their link; the app now shows an error instead of
"Check your email" in that case.
