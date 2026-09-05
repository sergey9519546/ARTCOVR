#!/usr/bin/env bash
# Prove that adopting a legacy push-created schema preserves data, repeated
# post-merge setup is safe, and fresh, partial, and mismatched databases stay
# on the correct path.
#
# The CI job supplies TEST_DATABASE_ADMIN_URL for its disposable PostgreSQL
# service. The default is the local PostgreSQL service used by development.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

for command in psql sha256sum; do
  command -v "$command" >/dev/null || {
    echo "$command is required for the database baseline contract tests." >&2
    exit 2
  }
done

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

mapfile -t migration_files < <(find "$root/lib/db/drizzle" -maxdepth 1 -type f -name '*.sql' -print | sort)
if [[ "${#migration_files[@]}" -eq 0 ]]; then
  echo "A committed Drizzle migration is required for the database baseline contract tests." >&2
  exit 2
fi

first_migration="${migration_files[0]}"
first_migration_hash="$(sha256sum "$first_migration" | awk '{print $1}')"
first_migration_created_at="$(
  sed -n 's/.*"when":[[:space:]]*\([0-9][0-9]*\).*/\1/p' \
    "$root/lib/db/drizzle/meta/_journal.json" | head -1
)"

test_database_name="artcovr_baseline_test_${BASHPID}_${RANDOM}"
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

apply_first_migration() {
  psql "$test_database_url" -X -v ON_ERROR_STOP=1 -f "$first_migration" >/dev/null
}

run_baseline() {
  local database_url="$1"
  set +e
  baseline_output="$(
    NODE_ENV=development DATABASE_URL="$database_url" \
      bash scripts/db/baseline-development.sh 2>&1
  )"
  baseline_status=$?
  set -e
}

run_normal_migrations() {
  DATABASE_URL="$test_database_url" pnpm run db:migrate >/dev/null
}

run_development_migration() {
  local run_label="$1"
  set +e
  development_migration_output="$(
    NODE_ENV=development DATABASE_URL="$test_database_url" \
      bash scripts/db/migrate-development.sh 2>&1
  )"
  development_migration_status=$?
  set -e
  if [[ "$development_migration_status" -ne 0 ]]; then
    echo "[$run_label] expected scripts/db/migrate-development.sh to succeed, got exit $development_migration_status." >&2
    printf '%s\n' "$development_migration_output" >&2
    exit 1
  fi
}

assert_status() {
  local scenario="$1"
  local expected_status="$2"
  if [[ "$baseline_status" -ne "$expected_status" ]]; then
    echo "[$scenario] expected exit $expected_status, got $baseline_status." >&2
    printf '%s\n' "$baseline_output" >&2
    exit 1
  fi
}

assert_output() {
  local scenario="$1"
  local expected_text="$2"
  if [[ "$baseline_output" != *"$expected_text"* ]]; then
    echo "[$scenario] expected diagnostic text: $expected_text" >&2
    printf '%s\n' "$baseline_output" >&2
    exit 1
  fi
}

assert_query() {
  local scenario="$1"
  local expected="$2"
  local query="$3"
  local actual
  actual="$(psql "$test_database_url" -X -v ON_ERROR_STOP=1 -Atqc "$query")"
  if [[ "$actual" != "$expected" ]]; then
    echo "[$scenario] expected query result '$expected', got '$actual'." >&2
    exit 1
  fi
}

row_counts() {
  psql "$test_database_url" -X -v ON_ERROR_STOP=1 -Atqc "
    with counts(table_name, row_count) as (
      select 'artcovr_credit_ledger', count(*) from artcovr_credit_ledger
      union all select 'artcovr_generations', count(*) from artcovr_generations
      union all select 'artcovr_inquiries', count(*) from artcovr_inquiries
      union all select 'artcovr_orders', count(*) from artcovr_orders
      union all select 'artcovr_reference_uploads', count(*) from artcovr_reference_uploads
      union all select 'artcovr_webhook_events', count(*) from artcovr_webhook_events
    )
    select string_agg(table_name || '=' || row_count::text, ',' order by table_name)
    from counts
  "
}

content_hash() {
  psql "$test_database_url" -X -v ON_ERROR_STOP=1 -Atqc "
    with snapshots(table_name, payload) as (
      select 'artcovr_credit_ledger',
        coalesce((select jsonb_agg(to_jsonb(t) order by t.id)::text
          from artcovr_credit_ledger t), '[]')
      union all
      select 'artcovr_generations',
        coalesce((select jsonb_agg(to_jsonb(t) order by t.id)::text
          from artcovr_generations t), '[]')
      union all
      select 'artcovr_inquiries',
        coalesce((select jsonb_agg(to_jsonb(t) order by t.id)::text
          from artcovr_inquiries t), '[]')
      union all
      select 'artcovr_orders',
        coalesce((select jsonb_agg(to_jsonb(t) order by t.id)::text
          from artcovr_orders t), '[]')
      union all
      select 'artcovr_reference_uploads',
        coalesce((select jsonb_agg(to_jsonb(t) order by t.id)::text
          from artcovr_reference_uploads t), '[]')
      union all
      select 'artcovr_webhook_events',
        coalesce((select jsonb_agg(to_jsonb(t) order by t.id)::text
          from artcovr_webhook_events t), '[]')
    )
    select md5(string_agg(table_name || ':' || payload, '|' order by table_name))
    from snapshots
  "
}

insert_legacy_rows() {
  psql "$test_database_url" -X -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
insert into artcovr_orders (
  id, clerk_user_id, artwork_id, artwork_slug, stripe_checkout_session_id,
  stripe_payment_intent_id, stripe_customer_id, customer_email,
  idempotency_key, amount_cents, currency, sale_mode, license_terms,
  included_credits, selected_preview_id, status, reservation_expires_at,
  created_at, paid_at, entitlement_expires_at
) values (
  'order-legacy-1', 'user-legacy-1', 'art-legacy-1', 'legacy-art',
  'cs_legacy_1', 'pi_legacy_1', 'cus_legacy_1', 'legacy@example.test',
  'idem-legacy-1', 2400, 'usd', 'standard', 'personal-use',
  3, 'preview-legacy-1', 'paid', '2026-09-04T13:00:00Z',
  '2026-09-04T12:00:00Z', '2026-09-04T12:01:00Z', '2027-09-04T12:00:00Z'
);
insert into artcovr_reference_uploads (
  id, clerk_user_id, artwork_id, object_key, sha256, width, height, bytes,
  created_at, uploaded_at, expires_at
) values (
  'upload-legacy-1', 'user-legacy-1', 'art-legacy-1',
  'uploads/legacy-1.png', 'sha256-legacy-1', 1200, 800, 45678,
  '2026-09-04T12:02:00Z', '2026-09-04T12:03:00Z', '2026-09-11T12:02:00Z'
);
insert into artcovr_generations (
  id, artwork_id, clerk_user_id, purchase_id, reference_upload_id, phase,
  status, allowance_slot, prompt, source_object_key, preview_object_key,
  clean_object_key, provider_request_id, provider_usage, expires_at,
  created_at
) values (
  'generation-legacy-1', 'art-legacy-1', 'user-legacy-1', 'order-legacy-1',
  'upload-legacy-1', 'preview', 'completed', 1, 'legacy prompt',
  'uploads/legacy-1.png', 'generations/legacy-1-preview.png',
  'generations/legacy-1-clean.png', 'provider-legacy-1',
  '{"model":"test","seconds":12}', '2026-09-11T12:04:00Z',
  '2026-09-04T12:04:00Z'
);
insert into artcovr_inquiries (
  id, clerk_user_id, email, name, message, created_at
) values (
  'inquiry-legacy-1', 'user-legacy-1', 'legacy@example.test',
  'Legacy Customer', 'Please preserve this inquiry.',
  '2026-09-04T12:05:00Z'
);
insert into artcovr_credit_ledger (
  id, account_key, order_id, entry_type, amount, reason, source_id,
  stripe_event_id, created_at
) values (
  'ledger-legacy-1', 'user-legacy-1', 'order-legacy-1', 'grant', 3,
  'legacy purchase', 'source-legacy-1', 'evt_legacy_1',
  '2026-09-04T12:06:00Z'
);
insert into artcovr_webhook_events (
  id, type, status, received_at, processed_at
) values (
  'webhook-legacy-1', 'checkout.session.completed', 'processed',
  '2026-09-04T12:07:00Z', '2026-09-04T12:08:00Z'
);
SQL
}

# Legacy adoption: build the schema without migration history, seed every
# commerce table, and prove both row counts and serialized contents survive.
create_database
apply_first_migration
insert_legacy_rows
before_counts="$(row_counts)"
before_content_hash="$(content_hash)"
run_baseline "$test_database_url"
assert_status "legacy adoption" 0
assert_output "legacy adoption" "DB BASELINE APPLIED"
assert_query "legacy migration marker" "1:$first_migration_hash" \
  "select count(*) || ':' || coalesce(string_agg(hash, ',' order by id), '')
   from drizzle.__drizzle_migrations"
assert_query "legacy migration timestamp" "$first_migration_created_at" \
  "select created_at::text from drizzle.__drizzle_migrations"
if [[ "$(row_counts)" != "$before_counts" || "$(content_hash)" != "$before_content_hash" ]]; then
  echo "[legacy adoption] baseline changed commerce row counts or contents." >&2
  exit 1
fi

# Post-merge setup must remain safe after adoption. Run the same entry point
# twice to prove a routine repeat does not duplicate history or touch commerce
# data.
run_development_migration "post-merge setup (first run)"
assert_query "post-merge setup first run migration count" "${#migration_files[@]}" \
  "select count(*)::text from drizzle.__drizzle_migrations"
if [[ "$(row_counts)" != "$before_counts" || "$(content_hash)" != "$before_content_hash" ]]; then
  echo "[post-merge setup first run] migration changed legacy commerce row counts or contents." >&2
  exit 1
fi
run_development_migration "post-merge setup (second run)"
assert_query "post-merge setup second run migration count" "${#migration_files[@]}" \
  "select count(*)::text from drizzle.__drizzle_migrations"
if [[ "$(row_counts)" != "$before_counts" || "$(content_hash)" != "$before_content_hash" ]]; then
  echo "[post-merge setup second run] migration changed legacy commerce row counts or contents." >&2
  exit 1
fi

# Fresh databases must remain history-free after baseline and be initialized
# by the normal migration command.
create_database
run_baseline "$test_database_url"
assert_status "fresh database" 0
assert_output "fresh database" "DB BASELINE SKIPPED"
assert_query "fresh database marker before migration" "" \
  "select coalesce(to_regclass('drizzle.__drizzle_migrations')::text, '')"
run_normal_migrations
assert_query "fresh database migration" "${#migration_files[@]}" \
  "select count(*)::text from drizzle.__drizzle_migrations"

# A partial push schema must not be mistaken for a complete legacy schema.
create_database
apply_first_migration
psql "$test_database_url" -X -v ON_ERROR_STOP=1 -c \
  "drop table artcovr_webhook_events" >/dev/null
run_baseline "$test_database_url"
assert_status "partial schema" 1
assert_output "partial schema" "existing development tables do not match"
assert_query "partial schema marker" "" \
  "select coalesce(to_regclass('drizzle.__drizzle_migrations')::text, '')"

# A complete-looking schema with an extra column is drift, not an adoptable
# legacy schema.
create_database
apply_first_migration
psql "$test_database_url" -X -v ON_ERROR_STOP=1 -c \
  "alter table artcovr_orders add column legacy_drift text" >/dev/null
run_baseline "$test_database_url"
assert_status "mismatched schema" 1
assert_output "mismatched schema" "existing development tables do not match"
assert_query "mismatched schema marker" "" \
  "select coalesce(to_regclass('drizzle.__drizzle_migrations')::text, '')"

echo "Database baseline contract tests passed: legacy preservation, fresh, partial, and mismatched schemas."