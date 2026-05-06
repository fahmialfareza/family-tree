# MongoDB Backup

## Required GitHub Secrets

Configure these repository secrets before enabling the workflow:

- `MONGODB_URI`: source database connection string used by `mongodump`.
- `R2_ACCOUNT_ID`: Cloudflare account identifier used to build the R2 S3 endpoint.
- `R2_BUCKET`: target bucket name for backup uploads.
- `R2_ACCESS_KEY_ID`: R2 access key for AWS CLI authentication.
- `R2_SECRET_ACCESS_KEY`: R2 secret key for AWS CLI authentication.

## How The Weekly Backup Works

The workflow lives at `.github/workflows/mongodb-backup.yml` and runs on two triggers:

- Every Sunday at `00:00` GMT+7, which is `17:00` UTC on Saturday in GitHub Actions cron.
- Manual `workflow_dispatch` runs from the GitHub Actions tab.

During each run the workflow:

1. Installs MongoDB Database Tools so `mongodump` is available.
2. Installs AWS CLI for the R2 upload.
3. Creates a compressed MongoDB archive with a UTC timestamped filename such as `catetin-mongodb-2026-05-06-023000.archive.gz`.
4. Uploads the archive to `s3://<R2_BUCKET>/mongodb/weekly/` using the Cloudflare R2 S3-compatible endpoint.

The archive is created directly by `mongodump --archive --gzip`, so there is no intermediate uncompressed dump directory left on the runner.

## Trigger A Backup Manually

1. Open the repository on GitHub.
2. Go to `Actions`.
3. Select `Weekly MongoDB Backup`.
4. Click `Run workflow`.

Manual runs use the same secrets, filename format, and R2 destination as the scheduled run.

## Restore Locally Or To Staging

Install MongoDB Database Tools on the machine where you want to restore the backup so `mongorestore` is available.

Download the backup file from Cloudflare R2, then run:

```bash
export RESTORE_MONGODB_URI='mongodb+srv://...'
./scripts/restore-mongodb.sh /path/to/catetin-mongodb-2026-05-06-023000.archive.gz
```

The restore script:

- Requires the backup file path as the first argument.
- Refuses to run unless `RESTORE_MONGODB_URI` is set.
- Shows the target URI and asks for explicit confirmation.
- Uses `mongorestore --archive --gzip` against `RESTORE_MONGODB_URI`.

Use a local or staging database first before restoring into any production-adjacent environment.

## Verify The Backup

Use a combination of these checks after a run:

1. Confirm the GitHub Actions job completed successfully.
2. Confirm a new object exists in the R2 bucket under `mongodb/weekly/` with the expected timestamped filename.
3. Download the archive and verify it is readable with `gzip -t /path/to/catetin-mongodb-2026-05-06-023000.archive.gz`.
4. Periodically restore the archive into a disposable local or staging database with `./scripts/restore-mongodb.sh` to confirm the backup is usable.
