#!/usr/bin/env bash
# Read-only database readiness/schema contract for the current Drizzle database.
# Migrations are applied separately with `pnpm run db:migrate`; this check never
# creates, drops, or mutates a database.
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

drizzle_dir="$root/lib/db/drizzle"
journal="$drizzle_dir/meta/_journal.json"
required_commerce_tables_file="$root/scripts/db/required-commerce-tables.txt"
mapfile -t migration_files < <(find "$drizzle_dir" -maxdepth 1 -type f -name '*.sql' -print | sort)
if [[ ! -s "$journal" || "${#migration_files[@]}" -eq 0 ]]; then
  echo "DB SCHEMA DRIFT: no versioned Drizzle migrations are available." >&2
  exit 11
fi
if [[ ! -s "$required_commerce_tables_file" ]]; then
  echo "DB SCHEMA DRIFT: required commerce table inventory is missing." >&2
  exit 11
fi

mapfile -t required_commerce_tables < <(
  awk '
    {
      sub(/#.*/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      if (length > 0) print
    }
  ' "$required_commerce_tables_file"
)
if [[ "${#required_commerce_tables[@]}" -eq 0 ]]; then
  echo "DB SCHEMA DRIFT: required commerce table inventory is empty." >&2
  exit 11
fi
declare -A seen_commerce_tables=()
for table_name in "${required_commerce_tables[@]}"; do
  if [[ ! "$table_name" =~ ^artcovr_[a-z0-9_]+$ ]]; then
    echo "DB SCHEMA DRIFT: invalid required commerce table name: $table_name." >&2
    exit 11
  fi
  if [[ -n "${seen_commerce_tables[$table_name]:-}" ]]; then
    echo "DB SCHEMA DRIFT: required commerce table inventory contains a duplicate: $table_name." >&2
    exit 11
  fi
  seen_commerce_tables["$table_name"]=1
done

expected_count="${#migration_files[@]}"
journal_count="$(grep -c '"tag":' "$journal" || true)"
if [[ "$journal_count" != "$expected_count" ]]; then
  echo "DB SCHEMA DRIFT: migration journal has $journal_count entries, expected $expected_count." >&2
  exit 11
fi

echo "==> checking database connectivity"
if ! psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "select 1" >/dev/null; then
  echo "DB OUTAGE: database is unreachable; schema version could not be checked." >&2
  exit 10
fi

echo "==> checking applied migration history"
if ! applied_hashes="$(
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
    "select hash from drizzle.__drizzle_migrations order by id"
)"; then
  echo "DB SCHEMA DRIFT: Drizzle migration history is missing or unreadable." >&2
  echo "For an existing development schema only, run NODE_ENV=development pnpm run db:baseline once." >&2
  exit 11
fi

expected_hashes="$(
  for migration in "${migration_files[@]}"; do
    sha256sum "$migration" | awk '{print $1}'
  done
)"
if [[ "$applied_hashes" != "$expected_hashes" ]]; then
  echo "DB SCHEMA DRIFT: applied migration history does not match the repository." >&2
  echo "Expected $expected_count migration(s); found $(printf '%s\n' "$applied_hashes" | sed '/^$/d' | wc -l)." >&2
  exit 11
fi

echo "==> checking ARTCOVR commerce tables"
required_table_values=""
for table_name in "${required_commerce_tables[@]}"; do
  required_table_values+="${required_table_values:+,}"$'\n'"        ('$table_name')"
done
missing_commerce_tables="$(
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "
    select coalesce(string_agg(table_name, ', ' order by table_name), '')
    from (
      values
${required_table_values}
    ) as required_tables(table_name)
    where to_regclass('public.' || table_name) is null
  "
)"
if [[ -n "$missing_commerce_tables" ]]; then
  echo "DB SCHEMA DRIFT: required commerce tables are missing: $missing_commerce_tables." >&2
  exit 11
fi

echo "DB OK: reachable, migration history is current, and required commerce tables are present; no writes performed."
