#!/usr/bin/env bash
# Exercise the database verifier against disposable databases only.
#
# The CI job supplies TEST_DATABASE_ADMIN_URL for its disposable PostgreSQL
# service. The default is the local PostgreSQL service used by development.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

for command in psql sha256sum; do
  command -v "$command" >/dev/null || {
    echo "$command is required for the database verifier contract tests." >&2
    exit 2
  }
done

mapfile -t migration_files < <(find "$root/lib/db/drizzle" -maxdepth 1 -type f -name '*.sql' -print | sort)
if [[ "${#migration_files[@]}" -eq 0 ]]; then
  echo "A committed Drizzle migration is required for the database verifier contract tests." >&2
  exit 2
fi
for migration_file in "${migration_files[@]}"; do
  if [[ ! -s "$migration_file" ]]; then
    echo "A committed Drizzle migration is empty: $migration_file" >&2
    exit 2
  fi
done
migration_count="${#migration_files[@]}"

required_commerce_tables_file="$root/scripts/db/required-commerce-tables.txt"
if [[ ! -s "$required_commerce_tables_file" ]]; then
  echo "The required commerce table inventory is required for the database verifier contract tests." >&2
  exit 2
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
  echo "The required commerce table inventory must not be empty." >&2
  exit 2
fi
declare -A seen_commerce_tables=()
for table_name in "${required_commerce_tables[@]}"; do
  if [[ ! "$table_name" =~ ^artcovr_[a-z0-9_]+$ ]]; then
    echo "Invalid required commerce table name: $table_name" >&2
    exit 2
  fi
  if [[ -n "${seen_commerce_tables[$table_name]:-}" ]]; then
    echo "Duplicate required commerce table name: $table_name" >&2
    exit 2
  fi
  seen_commerce_tables["$table_name"]=1
done

mapfile -t marked_commerce_tables < <(
  awk '
    /-- release-verifier: required-commerce-table/ {
      marked = 1
      next
    }
    marked && /^[[:space:]]*CREATE TABLE[[:space:]]+"[^"]+"/ {
      table_name = $0
      sub(/^.*CREATE TABLE[[:space:]]+"/, "", table_name)
      sub(/".*$/, "", table_name)
      print table_name
      marked = 0
    }
  ' "${migration_files[@]}"
)
manifest_table_list="$(printf '%s\n' "${required_commerce_tables[@]}" | sort -u)"
marked_table_list="$(printf '%s\n' "${marked_commerce_tables[@]}" | sort -u)"
if [[ "$manifest_table_list" != "$marked_table_list" ]]; then
  echo "Required commerce table contract failed: every migration table marked for release verification must be in $required_commerce_tables_file, and every manifest entry must be marked in a migration." >&2
  echo "--- manifest ---" >&2
  printf '%s\n' "$manifest_table_list" >&2
  echo "--- migration markers ---" >&2
  printf '%s\n' "$marked_table_list" >&2
  exit 1
fi

admin_url="${TEST_DATABASE_ADMIN_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
case "$admin_url" in
  *127.0.0.1*|*localhost*) ;;
  *)
    echo "TEST_DATABASE_ADMIN_URL must point to a loopback PostgreSQL service; refusing to run." >&2
    exit 2
    ;;
esac

psql "$admin_url" -X -v ON_ERROR_STOP=1 -Atqc "select 1" >/dev/null || {
  echo "The disposable PostgreSQL service is not reachable at TEST_DATABASE_ADMIN_URL." >&2
  exit 2
}

test_database_name="artcovr_verify_test_${BASHPID}_${RANDOM}"
test_database_url="${admin_url%/*}/$test_database_name"
created_database=false

cleanup() {
  if [[ "$created_database" == true ]]; then
    psql "$admin_url" -X -v ON_ERROR_STOP=1 -c \
      "drop database if exists \"$test_database_name\"" >/dev/null
  fi
}
trap cleanup EXIT

create_database() {
  if [[ "$created_database" == true ]]; then
    psql "$admin_url" -X -v ON_ERROR_STOP=1 -c \
      "drop database if exists \"$test_database_name\"" >/dev/null
  fi
  psql "$admin_url" -X -v ON_ERROR_STOP=1 -c \
    "create database \"$test_database_name\"" >/dev/null
  created_database=true
}

apply_application_schema() {
  for migration_file in "${migration_files[@]}"; do
    psql "$test_database_url" -X -v ON_ERROR_STOP=1 -f "$migration_file" >/dev/null
  done
}

seed_current_migration_history() {
  psql "$test_database_url" -X -v ON_ERROR_STOP=1 <<SQL >/dev/null
create schema drizzle;
create table drizzle.__drizzle_migrations (
  id serial primary key,
  hash text not null,
  created_at bigint
);
SQL
  for migration_file in "${migration_files[@]}"; do
    migration_hash="$(sha256sum "$migration_file" | awk '{print $1}')"
    psql "$test_database_url" -X -v ON_ERROR_STOP=1 -c \
      "insert into drizzle.__drizzle_migrations (hash, created_at) values ('$migration_hash', 1788563032328)" >/dev/null
  done
}

run_verifier() {
  local database_url="$1"
  set +e
  verifier_output="$(DATABASE_URL="$database_url" bash scripts/db/verify-database.sh 2>&1)"
  verifier_status=$?
  set -e
}

assert_status() {
  local scenario="$1"
  local expected_status="$2"
  if [[ "$verifier_status" -ne "$expected_status" ]]; then
    echo "[$scenario] expected exit $expected_status, got $verifier_status." >&2
    printf '%s\n' "$verifier_output" >&2
    exit 1
  fi
}

assert_output() {
  local scenario="$1"
  local expected_text="$2"
  if [[ "$verifier_output" != *"$expected_text"* ]]; then
    echo "[$scenario] expected diagnostic text: $expected_text" >&2
    printf '%s\n' "$verifier_output" >&2
    exit 1
  fi
}

assert_output_absent() {
  local scenario="$1"
  local unexpected_text="$2"
  if [[ "$verifier_output" == *"$unexpected_text"* ]]; then
    echo "[$scenario] unexpectedly reported: $unexpected_text" >&2
    printf '%s\n' "$verifier_output" >&2
    exit 1
  fi
}

# Healthy database: the verifier must accept current migration hashes and the
# required commerce tables.
create_database
apply_application_schema
seed_current_migration_history
run_verifier "$test_database_url"
assert_status "healthy" 0
assert_output "healthy" "DB OK: reachable, migration history is current, and required commerce tables are present; no writes performed."

# Outage: connectivity failures must remain operational errors, not drift.
unreachable_url="${admin_url%:*}:1/$test_database_name"
run_verifier "$unreachable_url"
assert_status "outage" 10
assert_output "outage" "DB OUTAGE: database is unreachable; schema version could not be checked."
assert_output_absent "outage" "DB SCHEMA DRIFT:"

# Missing migration history: a reachable schema without the Drizzle history
# table is actionable schema drift and includes the safe development remedy.
create_database
apply_application_schema
run_verifier "$test_database_url"
assert_status "missing migration history" 11
assert_output "missing migration history" "DB SCHEMA DRIFT: Drizzle migration history is missing or unreadable."
assert_output "missing migration history" "For an existing development schema only, run NODE_ENV=development pnpm run db:baseline once."
assert_output_absent "missing migration history" "DB OUTAGE:"

# Missing commerce table: a reachable database with current migration history
# must still fail the release check with actionable schema drift.
create_database
apply_application_schema
seed_current_migration_history
psql "$test_database_url" -X -v ON_ERROR_STOP=1 -c \
  "drop table artcovr_webhook_events" >/dev/null
run_verifier "$test_database_url"
assert_status "missing commerce table" 11
assert_output "missing commerce table" "DB SCHEMA DRIFT: required commerce tables are missing: artcovr_webhook_events."
assert_output_absent "missing commerce table" "DB OUTAGE:"

# Multiple missing commerce tables: the diagnostic must name every absent table
# while leaving present required tables out of the list.
create_database
apply_application_schema
seed_current_migration_history
psql "$test_database_url" -X -v ON_ERROR_STOP=1 -c \
  "drop table artcovr_orders, artcovr_webhook_events" >/dev/null
run_verifier "$test_database_url"
assert_status "multiple missing commerce tables" 11
assert_output "multiple missing commerce tables" \
  "DB SCHEMA DRIFT: required commerce tables are missing: artcovr_orders, artcovr_webhook_events."
assert_output_absent "multiple missing commerce tables" "artcovr_credit_ledger"
assert_output_absent "multiple missing commerce tables" "DB OUTAGE:"

# Mismatched hash: a history table with stale repository state is a distinct
# drift classification and reports both expected and observed counts.
create_database
apply_application_schema
psql "$test_database_url" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create schema drizzle;
create table drizzle.__drizzle_migrations (
  id serial primary key,
  hash text not null,
  created_at bigint
);
SQL
psql "$test_database_url" -X -v ON_ERROR_STOP=1 -c \
  "insert into drizzle.__drizzle_migrations (hash, created_at) values ('stale-migration-hash', 1788563032328)" >/dev/null
for migration_file in "${migration_files[@]:1}"; do
  migration_hash="$(sha256sum "$migration_file" | awk '{print $1}')"
  psql "$test_database_url" -X -v ON_ERROR_STOP=1 -c \
    "insert into drizzle.__drizzle_migrations (hash, created_at) values ('$migration_hash', 1788563032328)" >/dev/null
done
run_verifier "$test_database_url"
assert_status "mismatched hash" 11
assert_output "mismatched hash" "DB SCHEMA DRIFT: applied migration history does not match the repository."
assert_output "mismatched hash" "Expected $migration_count migration(s); found $migration_count."
assert_output_absent "mismatched hash" "DB OUTAGE:"

echo "Database verifier contract tests passed: healthy, outage, missing history, missing commerce table(s), and mismatched hash."
