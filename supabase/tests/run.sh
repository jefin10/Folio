#!/usr/bin/env bash
# Applies every migration to a disposable Postgres 16 container and runs the
# SQL test-suite as real `authenticated` users (RLS on).
#   bash supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=folio-sql-test
IMAGE=${FOLIO_PG_IMAGE:-postgres:16-alpine}
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres -q 2>/dev/null && docker exec "$NAME" psql -U postgres -tAc 'select 1' >/dev/null 2>&1; then break; fi
  sleep 1
done
PSQL=(docker exec -i "$NAME" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -o /dev/null)
"${PSQL[@]}" < tests/shim.sql
for f in migrations/*.sql; do
  echo "→ applying $(basename "$f")"
  "${PSQL[@]}" < "$f"
done
echo "→ running tests"
"${PSQL[@]}" < tests/ledger_test.sql
echo "✓ all SQL tests passed"
