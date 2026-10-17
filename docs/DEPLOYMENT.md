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
| `TEST_DATABASE_URL` | Test database, used only by `pnpm test` / `pnpm e2e` |

## Production deployment (any provider)
1. Provision managed Postgres 16 in an EU region with automated daily backups and point-in-time recovery.
2. Build and run the app:
   - `pnpm install --frozen-lockfile && pnpm build`
   - `pnpm db:migrate` with `DATABASE_URL` set
   - `pnpm start` behind HTTPS
3. Point the health check at `GET /api/health`. It returns 200 when the database is reachable.
4. **Do not run `pnpm seed` in production.** It wipes the database. Create the first admin with a one-off SQL insert, or a small script using `createUser` from `src/server/services/admin.ts`.
5. Set budget alerts with the cloud provider (ARD section 9).

The app is stateless. You can run it as a container (Azure App Service, AWS App Runner/ECS, Google Cloud Run) or on a VM, with more than one instance if needed. All state is in Postgres.

## Backups and restore (Q05)
- Locally, `scripts/backup.ps1` writes a `pg_dump` custom-format file to `backups/`. `scripts/restore.ps1 -File <dump>` restores it into a **new** database (`attendance_restore`) and compares row counts table by table.
- In production, rely on the managed database's automated backups and PITR. Before acceptance, carry out one documented restore into a separate instance and record its result.
- Agree backup frequency, RPO/RTO and retention with the business owner (ARD p.8).

## Operations
- **Errors:** unexpected server errors are logged to `error_log`. IT can view them at `/system`.
- **Deactivating a user** deletes their sessions immediately.
- **Migrations** live in `src/server/db/migrations`. Create new ones with `pnpm db:generate` (and `--custom` for raw SQL). Apply them with `pnpm db:migrate`.
