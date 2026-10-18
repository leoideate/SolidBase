# Technical setup and deployment

## Architecture
- **One Next.js 15 application** (Node 22) serves the PWA screens, server actions and three JSON/CSV endpoints:
  - `/api/clock`
  - `/api/export`
  - `/api/health`
- **PostgreSQL 16** holds all data. Business rules are enforced in the database as well as in code:
  - one open entry per worker (partial unique index);
  - no overlapping entries (`EXCLUDE USING gist`, which needs `btree_gist`);
  - entries of approved timesheets are locked, and approved versions are immutable (triggers);
  - audit, revision and export logs are append-only (triggers).
- Sessions are random 256-bit tokens, stored hashed (SHA-256) in `sessions`, in an `httpOnly`, `SameSite=Lax` cookie.
- PINs are hashed with Argon2id.
- Every business table carries `company_id`, and all access goes through `src/server/authz.ts`.

## Environment
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (TLS required in production, e.g. `?sslmode=require`) |
| `COOKIE_SECURE` | `true` in production, so the session cookie is HTTPS-only |
| `BANK_DATA_KEY` | Secret (32+ characters) that encrypts worker IBANs. **Keep a copy with the database backups and never change it once IBANs are saved:** stored IBANs can't be read without it. Render generates it (`generateValue`). |
| `TEST_DATABASE_URL` | Test database, used only by `pnpm test` / `pnpm e2e` |

## Production deployment (any provider)
1. Provision managed Postgres 16 in an EU region with automated daily backups and point-in-time recovery.
2. Build and run the app:
   - `pnpm install --frozen-lockfile && pnpm build`
   - `pnpm db:migrate` with `DATABASE_URL` set
   - `pnpm start` behind HTTPS
3. Point the health check at `GET /api/health`. It returns 200 when the database is reachable.
4. **Do not run `pnpm seed` in production.** It wipes the database. Create the first admin with `pnpm admin:create` locally, or `npx tsx scripts/create-admin.ts` on a server (see below).
5. Set budget alerts with the cloud provider (ARD section 9).

The app is stateless. You can run it as a container (Azure App Service, AWS App Runner/ECS, Google Cloud Run) or on a VM, with more than one instance if needed. All state is in Postgres.

## Deploying on Render

`render.yaml` in the repository root is a Render Blueprint. It creates:

| Resource | Name | Settings |
|---|---|---|
| PostgreSQL 16 | `site-attendance-db` | Frankfurt, plan `basic-256mb`, no public access (`ipAllowList: []`) |
| Node web service | `site-attendance` | Frankfurt, plan `starter`, health check `/api/health` |

The web service gets these environment variables: `DATABASE_URL` (the database's internal connection string), `COOKIE_SECURE=true`, `NODE_VERSION=22`, `APP_TIMEZONE=Europe/Dublin` and `BANK_DATA_KEY`, which Render generates. After the first deploy, copy `BANK_DATA_KEY` from the service's **Environment** page into your password manager. pnpm is fetched with `npx` at the version pinned in `render.yaml` (12.4.1, the version used locally). Update all three commands together if you upgrade pnpm.

Every deploy then runs these steps:
1. **Build:** `pnpm install --frozen-lockfile && pnpm build`
2. **Pre-deploy:** `pnpm db:migrate`. If a migration fails, the new version doesn't go live.
3. **Start:** `next start -p $PORT`

### First deploy
1. Push this repository to GitHub.
2. In Render, under **GitHub → Configure account**, give Render access to the repository.
3. Go to **New → Blueprint**, pick the repository, check the resources listed, and click **Apply**.
4. When the first deploy is live, open the web service → **Shell** and create the first administrator:
   ```bash
   npx tsx scripts/create-admin.ts --company "Your Company Ltd" --username <login> --name "Full Name" --code A001 --pin <6 digits>
   ```
   The admin logs in at the service URL and must choose a new PIN. Everything else (projects, roles, rates, users, supervisors) is set up from Admin.
5. Optionally add a custom domain under the web service → **Settings → Custom Domains**. Render issues the HTTPS certificate.

### Notes
- Pushing to the default branch redeploys automatically (`autoDeploy: true`).
- The pre-deploy command and the Shell aren't available on free instances. That's why the Blueprint uses `starter`. Free Render databases also expire, so production uses a paid database plan.
- Plan names and prices change. Check them on the Blueprint review screen before you apply.
- Backups: the paid Render Postgres plans include point-in-time recovery. Agree retention with the owner (see below).

## Backups and restore (Q05)
- Locally, `scripts/backup.ps1` writes a `pg_dump` custom-format file to `backups/`. `scripts/restore.ps1 -File <dump>` restores it into a **new** database (`attendance_restore`) and compares row counts table by table.
- In production, rely on the managed database's automated backups and PITR. Before acceptance, carry out one documented restore into a separate instance and record its result.
- Agree backup frequency, RPO/RTO and retention with the business owner (ARD p.8).

## Operations
- **Errors:** unexpected server errors are logged to `error_log`. IT can view them at `/system`.
- **Deactivating a user** deletes their sessions immediately.
- **Migrations** live in `src/server/db/migrations`. Create new ones with `pnpm db:generate` (and `--custom` for raw SQL). Apply them with `pnpm db:migrate`.
