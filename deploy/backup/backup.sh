#!/usr/bin/env bash
# Nightly backup (install.sh sets up the timer): a Postgres dump plus the
# evidence files, seven of each kept in ./backups, copied to
# s3://$BACKUP_BUCKET/backups/ when .env names a bucket (needs the aws CLI),
# and recorded in backup_runs so the Account page shows when the last good
# one ran. Any failure before the record exits non-zero, which systemd logs
# (journalctl -u openchar-backup).
set -euo pipefail
cd "$(dirname "$0")/../.."
BACKUP_BUCKET="$(sed -n 's/^BACKUP_BUCKET=//p' .env 2>/dev/null || true)"
TS="$(date -u +%Y-%m-%dT%H%MZ)"
mkdir -p backups
chmod 700 backups

docker compose exec -T db pg_dump -U biochar biochar | gzip > "backups/db-$TS.sql.gz.part"
mv "backups/db-$TS.sql.gz.part" "backups/db-$TS.sql.gz"
docker compose exec -T api tar -czf - -C /app/data . > "backups/files-$TS.tgz.part"
mv "backups/files-$TS.tgz.part" "backups/files-$TS.tgz"
chmod 600 "backups/db-$TS.sql.gz" "backups/files-$TS.tgz"

ls -t backups/db-*.sql.gz | tail -n +8 | xargs -r rm --
ls -t backups/files-*.tgz | tail -n +8 | xargs -r rm --

OFFSITE=false
if [ -n "$BACKUP_BUCKET" ]; then
  if aws s3 cp "backups/db-$TS.sql.gz" "s3://$BACKUP_BUCKET/backups/" --only-show-errors &&
    aws s3 cp "backups/files-$TS.tgz" "s3://$BACKUP_BUCKET/backups/" --only-show-errors; then
    OFFSITE=true
  else
    echo "offsite copy failed; host copy kept" >&2
  fi
fi

DB_BYTES="$(stat -c %s "backups/db-$TS.sql.gz")"
FILES_BYTES="$(stat -c %s "backups/files-$TS.tgz")"
docker compose exec -T db psql -U biochar -d biochar -qc \
  "INSERT INTO backup_runs (db_bytes, files_bytes, offsite) VALUES ($DB_BYTES, $FILES_BYTES, $OFFSITE)"
echo "backup $TS: db $DB_BYTES bytes, files $FILES_BYTES bytes, offsite $OFFSITE"
