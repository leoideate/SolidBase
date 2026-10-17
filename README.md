# Site Attendance

This is the Release 1 attendance platform from the Application Requirements Document (ARD v1.0, 17 Oct 2026). It is one responsive web app that installs as a PWA on phones and tablets. In it:

- workers clock in and out against a project and role;
- managers review, correct, return and approve the weekly timesheets of their **assigned** workers;
- admins manage setup and permissions;
- CostMaster users see approved labour cost for the projects they are authorised for.

| Area | Where |
|---|---|
| Data model and DB constraints | `src/server/db/schema.ts`, `src/server/db/migrations/` |
| Access scope (the only place it's computed) | `src/server/authz.ts` |
| Clocking (idempotent, server time, week split) | `src/server/services/clock.ts` |
| Rates (worker+project > worker > project > role) | `src/server/services/rates.ts` |
| Timesheets, versions, approval, reopen | `src/server/services/timesheets.ts` |
| Manager corrections | `src/server/services/corrections.ts` |
| CSV export / CostMaster | `src/server/services/exports.ts`, `costmaster.ts` |
| Screens | `src/app/(app)/…` |

## Run locally

Requires Node 22, pnpm and Docker Desktop.

```bash
cp .env.example .env          # first time only
docker compose up -d           # Postgres 16 on localhost:5434 (dev + test databases)
pnpm install
pnpm db:migrate && pnpm db:migrate --test
pnpm seed                      # wipes and seeds demo data (see scripts/seed.ts for logins)
pnpm dev                       # http://localhost:3000
```

The demo logins are listed at the top of `scripts/seed.ts`. They are for development only.

## Tests

```bash
pnpm test       # unit + integration (Vitest, against the attendance_test database)
pnpm e2e        # Playwright business acceptance tests T01–T08 + responsive checks
```

`pnpm e2e` starts its own server on port 3100 against the test database, using a separate build directory (`.next-e2e`). It can therefore run while `pnpm dev` is up. Run `npx playwright install chromium` once beforehand.

## Documentation

- [docs/DECISIONS.md](docs/DECISIONS.md): settings confirmed for planning (ARD p.8) and how each requirement is met
- [docs/ROUNDING.md](docs/ROUNDING.md): duration, rounding and timezone policy
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md): administrator instructions
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): technical setup, hosting, backups and restore
- [docs/INFRA_BUDGET_TEMPLATE.md](docs/INFRA_BUDGET_TEMPLATE.md): template for the ARD section 9 cost estimate
