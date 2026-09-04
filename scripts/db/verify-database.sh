#!/usr/bin/env bash
# Read-only database readiness/schema contract for the current Drizzle database.
# Schema changes are applied separately with the db package's explicit push
# command; this check never creates, drops, or mutates a database.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for the read-only database contract check." >&2
  exit 2
fi
command -v psql >/dev/null || {
  echo "psql is required for the read-only database contract check." >&2
  exit 2
}

echo "==> checking database connectivity"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "select 1" >/dev/null

echo "==> checking ARTCOVR commerce tables"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "
  select case
    when to_regclass('public.artcovr_orders') is not null
     and to_regclass('public.artcovr_credit_ledger') is not null
     and to_regclass('public.artcovr_webhook_events') is not null
    then 'schema-ready'
    else 'schema-missing'
  end
" | grep -qx "schema-ready"

echo "DB OK: reachable and required commerce tables are present; no writes performed."
