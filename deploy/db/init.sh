#!/bin/sh
# Runs once on a fresh volume (docker-entrypoint-initdb.d). Creates the roles
# and schema that GoTrue (auth) and PostgREST (rest) expect — the only parts
# of Supabase's Postgres image Folio needs. Passwords come from the env.
set -e
psql -v ON_ERROR_STOP=1 -v pgpass="$POSTGRES_PASSWORD" --username postgres --dbname postgres <<'SQL'
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator login noinherit password :'pgpass';
grant anon, authenticated, service_role to authenticator;

create role supabase_auth_admin login noinherit createrole password :'pgpass';
create schema auth authorization supabase_auth_admin;
grant create on database postgres to supabase_auth_admin;
alter role supabase_auth_admin set search_path = auth;

create schema if not exists extensions;
grant usage on schema auth, public, extensions to anon, authenticated, service_role;
SQL
