#!/usr/bin/env bash
# Gate G8 (.agent-state/RELEASE_GATES.md): apply every migration to a disposable
# PostgreSQL and run the contract + behavioural suites against it.
#
# Until 2026-08-31 this gate had never been executed, because it needs a real
# database and nobody had stood one up. Running it immediately surfaced a
# contract assertion that had been broken since migration 0012 landed.
#
# Requires: a reachable PostgreSQL and psql. Point PG* at it, or let the
# defaults below hit a local disposable instance.
#
#   PGHOST=127.0.0.1 PGPORT=5433 PGUSER=postgres bash scripts/db/verify-database.sh
#
# NEVER point this at production. It creates a database and writes rows.
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5433}"
PGUSER="${PGUSER:-postgres}"
DB="${ARTCOVR_TEST_DB:-artcovr_verify}"
export PGHOST PGPORT PGUSER

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root/.migration-backup"

echo "==> target: $PGUSER@$PGHOST:$PGPORT, database $DB"
psql -q -d postgres -v ON_ERROR_STOP=1 \
  -c "drop database if exists $DB;" \
  -c "create database $DB;"
export PGDATABASE="$DB"

echo "==> supabase shim (roles, auth.users, storage tables)"
psql -q -v ON_ERROR_STOP=1 -f supabase/tests/bootstrap_supabase_shim.sql

echo "==> applying migrations in order"
count=0
for m in supabase/migrations/*.sql; do
  printf '    %-52s ' "$(basename "$m")"
  psql -q -v ON_ERROR_STOP=1 -f "$m" >/dev/null
  echo "applied"
  count=$((count + 1))
done
echo "    $count migrations applied"

echo "==> contract invariants (shape)"
out="$(psql -tA -v ON_ERROR_STOP=1 -f supabase/tests/contract_invariants.sql)"
false_count="$(printf '%s\n' "$out" | grep -cx 'f' || true)"
true_count="$(printf '%s\n' "$out" | grep -cx 't' || true)"
if [ "$false_count" != "0" ]; then
  echo "    FAILED: $false_count assertion(s) returned false" >&2
  exit 1
fi
echo "    $true_count assertions true, 0 false"

echo "==> behavioural checks"
psql -v ON_ERROR_STOP=1 -f supabase/tests/behaviour_checks.sql 2>&1 \
  | grep -E 'NOTICE|PASSED' | sed 's/^psql:[^ ]* /    /'

echo "==> dropping $DB"
psql -q -d postgres -c "drop database if exists $DB;" >/dev/null

echo "G8 OK: migrations apply, contract invariants hold, behavioural checks pass."
