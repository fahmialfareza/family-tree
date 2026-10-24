# Postgres Backup

The family-tree data lives in the `family-tree` database on the Railway Postgres service. It replaced MongoDB; older MongoDB archives remain in R2 under `mongodb/weekly/` but are no longer produced.

## Required GitHub Secrets

Configure these repository secrets before enabling the workflow:

- `DATABASE_URL`: connection string for the `family-tree` database used by `pg_dump`. GitHub Actions runs outside Railway, so use the public TCP proxy URL, not the private `*.railway.internal` one. Prefer a read-only role.
- `R2_ACCOUNT_ID`: Cloudflare account identifier used to build the R2 S3 endpoint.
- `R2_BUCKET`: target bucket name for backup uploads.
- `R2_ACCESS_KEY_ID`: R2 access key for AWS CLI authentication.
- `R2_SECRET_ACCESS_KEY`: R2 secret key for AWS CLI authentication.

## How The Weekly Backup Works

The workflow lives at `.github/workflows/postgres-backup.yml` and runs on two triggers:

- Every Sunday at `00:00` GMT+7, which is `17:00` UTC on Saturday in GitHub Actions cron.
- Manual `workflow_dispatch` runs from the GitHub Actions tab.

During each run the workflow:

1. Installs the PostgreSQL client from the PGDG apt repository. `PG_CLIENT_VERSION` must be the same major version as the Railway server or newer.
2. Installs AWS CLI for the R2 upload.
3. Creates a compressed custom-format dump such as `family-tree-postgres-2026-10-25-170000.dump` and checks it with `pg_restore --list`.
4. Uploads the dump to `s3://<R2_BUCKET>/postgres/daily/` (kept 14 days) and, on Saturdays and manual runs, also to `postgres/weekly/` (kept 8 weeks), using the Cloudflare R2 S3-compatible endpoint.
5. Deletes dumps older than 4 weeks from that prefix.

## Trigger A Backup Manually

1. Open the repository on GitHub.
2. Go to `Actions`.
3. Select `Weekly Postgres Backup`.
4. Click `Run workflow`.

## Restore Locally Or To Staging

Install the PostgreSQL client tools so `pg_restore` is available. Download the dump from Cloudflare R2, then run:

```bash
export RESTORE_DATABASE_URL='postgres://user:pass@localhost:5432/family-tree'
./scripts/restore-postgres.sh /path/to/family-tree-postgres-2026-10-25-170000.dump
```

The restore script:

- Requires the dump file path as the first argument.
- Refuses to run unless `RESTORE_DATABASE_URL` is set.
- Shows the target with the password masked and asks for explicit confirmation.
- Runs `pg_restore --clean --if-exists --single-transaction`, so a failed restore leaves the target unchanged.

Restore into a local or staging database first before touching production.

## Verify The Backup

1. Confirm the GitHub Actions job completed successfully.
2. Confirm a new object exists in the R2 bucket under `postgres/daily/` (and `postgres/weekly/` for manual runs).
3. Download the dump and run `pg_restore --list /path/to/file.dump`.
4. Periodically restore it into a disposable database with `./scripts/restore-postgres.sh`.
