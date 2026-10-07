# jvcarpool — BSB carpooling

**Public pilot URL (Cloudflare quick tunnel, changes when the tunnel restarts):**
https://roy-under-screw-spectacular.trycloudflare.com

Sign-in is open to `@britishschool.be` addresses (for example `012222@britishschool.be`)
and to anyone an administrator has invited.

Staff carpooling pilot (working title "Poolmate"). See `docs/BRIEF.md` for the specification, `CLAUDE.md` for stack and conventions, `docs/pilot-runbook.md` for running the pilot.

```
cp .env.example .env     # then edit
npm run setup
npm run dev              # http://localhost:3000
npm test
```

Development sign-in: the magic link is printed to the console and shown at `/dev/mailbox`. `docker compose up -d` starts Mailpit at http://localhost:8025.

## Public URL

`npm run dev` on port 3100, then `PORT=3100 npm run tunnel` (cloudflared). Put the printed
`https://….trycloudflare.com` address in `AUTH_URL` in `.env`, restart the dev server and update
the URL at the top of this file. Until real SMTP is configured in `.env`, sign-in emails only land in
Mailpit, so colleagues cannot receive their link; the app now shows an error instead of
"Check your email" in that case.
