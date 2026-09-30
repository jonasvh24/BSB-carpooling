# jvcarpool

Staff carpooling pilot (working title "Poolmate"). See `docs/BRIEF.md` for the specification, `CLAUDE.md` for stack and conventions, `docs/pilot-runbook.md` for running the pilot.

```
cp .env.example .env     # then edit
npm run setup
npm run dev              # http://localhost:3000
npm test
```

Development sign-in: the magic link is printed to the console and shown at `/dev/mailbox`. `docker compose up -d` starts Mailpit at http://localhost:8025.
