#!/usr/bin/env bash

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup-file-path>" >&2
  exit 1
fi

backup_file="$1"

if [[ ! -f "${backup_file}" ]]; then
  echo "Backup file not found: ${backup_file}" >&2
  exit 1
fi

if [[ -z "${RESTORE_DATABASE_URL:-}" ]]; then
  echo "RESTORE_DATABASE_URL is required." >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required. Install the PostgreSQL client tools first." >&2
  exit 1
fi

# Never echo credentials: show the target without the password.
echo "Backup file: ${backup_file}"
echo "Restore target: $(sed -E 's#://([^:/@]+):[^@]*@#://\1:***@#' <<< "${RESTORE_DATABASE_URL}")"
echo "Existing family-tree tables in the target will be dropped and recreated."
read -r -p "Type 'restore' to continue: " confirmation

if [[ "${confirmation}" != "restore" ]]; then
  echo "Restore cancelled."
  exit 1
fi

pg_restore --dbname="${RESTORE_DATABASE_URL}" --clean --if-exists --no-owner --no-privileges --single-transaction "${backup_file}"

echo "Restore completed."
