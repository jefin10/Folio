#!/usr/bin/env bash
# Applies supabase/migrations/*.sql in order, once each, as the `postgres`
# role (what `supabase db push` does), after GoTrue has created auth.users.
set -euo pipefail
export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL=(psql -h db -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

until "${PSQL[@]}" -c 'select 1' >/dev/null 2>&1; do sleep 2; done
echo "waiting for GoTrue to create auth.users…"
until [ "$("${PSQL[@]}" -tAc "select count(*) from information_schema.tables where table_schema='auth' and table_name='users'")" = "1" ]; do sleep 3; done

"${PSQL[@]}" -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[], applied_at timestamptz default now())"

for f in /folio/migrations/*.sql; do
  base=$(basename "$f" .sql)
  version=${base%%_*}
  name=${base#*_}
  applied=$("${PSQL[@]}" -tAc "select 1 from supabase_migrations.schema_migrations where version = '$version'")
  if [ "$applied" = "1" ]; then
    echo "· $base (already applied)"
    continue
  fi
  echo "→ applying $base"
  "${PSQL[@]}" --single-transaction -f "$f"
  "${PSQL[@]}" -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name')"
done

if [ "${FOLIO_SINGLE_OWNER:-on}" = "on" ]; then
  "${PSQL[@]}" -c "insert into private.instance_settings (key, value) values ('single_owner', 'on') on conflict (key) do update set value = excluded.value, updated_at = now()"
  echo "✓ single-owner lock on"
fi
"${PSQL[@]}" -c "notify pgrst, 'reload schema'"
echo "✓ migrations done"
