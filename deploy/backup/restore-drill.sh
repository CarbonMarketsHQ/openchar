#!/usr/bin/env bash
# Backup-restore drill: restore the latest dump into a scratch Postgres,
# compare row counts with the live database, clean up. Run it after a backup,
# and on a schedule you trust: a backup nobody has restored is a hope.
set -e
cd "$(dirname "$0")/../.."

LATEST=$(ls -t backups/db-*.sql.gz | head -1)
echo "drill restoring: $LATEST"
docker rm -f oc-restore-test >/dev/null 2>&1 || true
docker run -d --name oc-restore-test -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=restore postgres:16-alpine >/dev/null
for i in $(seq 1 20); do docker exec oc-restore-test pg_isready -U postgres >/dev/null 2>&1 && break; sleep 2; done
gunzip -c "$LATEST" | docker exec -i oc-restore-test psql -U postgres -d restore -q
PASS=1
for T in workspaces users batches telemetry field_events sources; do
  LIVE=$(docker compose exec -T db psql -U biochar -d biochar -tAc "select count(*) from $T")
  REST=$(docker exec oc-restore-test psql -U postgres -d restore -tAc "select count(*) from $T")
  echo "$T live=$LIVE restored=$REST"
  [ "$LIVE" = "$REST" ] || PASS=0
done
docker rm -f oc-restore-test >/dev/null
if [ "$PASS" = "1" ]; then echo "RESTORE DRILL PASS"; else echo "RESTORE DRILL FAIL"; exit 1; fi
