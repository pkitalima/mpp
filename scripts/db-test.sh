#!/usr/bin/env bash
# Applies the migration to a throwaway database and runs the RLS policy tests against it.
#
#   npm run db:test                     # starts a temporary local cluster
#   DATABASE_URL=postgres://... npm run db:test   # uses an existing database (it will be reset)
#
# The RLS tests are the proof that flag visibility holds at the database level rather than only
# in the UI, so they are meant to run on every change to the schema.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHIM="$ROOT/supabase/test/shim.sql"
MIGRATION="$ROOT/supabase/migrations/0001_init.sql"
TESTS="$ROOT/supabase/test/rls.test.sql"

run_sql() { psql "$1" -v ON_ERROR_STOP=1 -q -f "$2"; }

if [ -n "${DATABASE_URL:-}" ]; then
  echo "Using DATABASE_URL"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c 'drop schema if exists public cascade; create schema public;'
  run_sql "$DATABASE_URL" "$SHIM"
  run_sql "$DATABASE_URL" "$MIGRATION"
  run_sql "$DATABASE_URL" "$TESTS"
  exit 0
fi

# No database handed to us: stand up a temporary cluster.
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1 || true)"
[ -z "$PGBIN" ] && PGBIN="$(dirname "$(command -v initdb 2>/dev/null || echo /nonexistent/x)")"
if [ ! -x "$PGBIN/initdb" ]; then
  echo "No local Postgres found. Install postgresql, or pass DATABASE_URL." >&2
  exit 1
fi

PGDATA="$(mktemp -d)/data"
PORT="${PGPORT:-5433}"
SOCKET="$(mktemp -d)"
AS_USER=""
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  AS_USER="postgres"          # initdb refuses to run as root
  chmod 777 "$SOCKET"
  mkdir -p "$PGDATA" && chown -R postgres "$(dirname "$PGDATA")"
fi
as() { if [ -n "$AS_USER" ]; then su "$AS_USER" -c "$1"; else bash -c "$1"; fi; }

cleanup() { as "$PGBIN/pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true; }
trap cleanup EXIT

as "$PGBIN/initdb -D $PGDATA -A trust" >/dev/null
as "$PGBIN/pg_ctl -D $PGDATA -o '-k $SOCKET -p $PORT -c listen_addresses=' -l $PGDATA/server.log start" >/dev/null
sleep 2

URL="postgres://$(id -un "${AS_USER:-$(id -un)}")@/postgres?host=$SOCKET&port=$PORT"
as "psql '$URL' -q -c 'drop database if exists mpp_test' -c 'create database mpp_test'" >/dev/null 2>&1
TEST_URL="postgres://$(id -un "${AS_USER:-$(id -un)}")@/mpp_test?host=$SOCKET&port=$PORT"

for file in "$SHIM" "$MIGRATION" "$TESTS"; do
  as "psql '$TEST_URL' -v ON_ERROR_STOP=1 -q -f $file"
done
