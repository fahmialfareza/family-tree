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

if [[ -z "${RESTORE_MONGODB_URI:-}" ]]; then
  echo "RESTORE_MONGODB_URI is required." >&2
  exit 1
fi

if ! command -v mongorestore >/dev/null 2>&1; then
  echo "mongorestore is required. Install MongoDB Database Tools first." >&2
  exit 1
fi

echo "Backup file: ${backup_file}"
echo "Restore target: ${RESTORE_MONGODB_URI}"
read -r -p "Type 'restore' to continue: " confirmation

if [[ "${confirmation}" != "restore" ]]; then
  echo "Restore cancelled."
  exit 1
fi

mongorestore --uri="${RESTORE_MONGODB_URI}" --archive="${backup_file}" --gzip

echo "Restore completed."