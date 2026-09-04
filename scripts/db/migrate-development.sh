#!/usr/bin/env bash
# Apply committed Drizzle migrations without destroying an existing development
# database. An existing schema with no migration history is adopted only after
# its table/column contract matches the initial migration.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required for development database migration." >&2
  exit 2
fi
if [[ "${NODE_ENV:-}" == "production" ]]; then
  echo "Refusing automatic development database adoption while NODE_ENV=production." >&2
  exit 2
fi
command -v psql >/dev/null || {
  echo "psql is required for development database migration." >&2
  exit 2
}

drizzle_dir="$root/lib/db/drizzle"
first_migration="$(find "$drizzle_dir" -maxdepth 1 -type f -name '*.sql' -print | sort | head -n 1)"
if [[ -z "$first_migration" ]]; then
  echo "No committed Drizzle migration was found." >&2
  exit 2
fi

history_count="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "select count(*) from drizzle.__drizzle_migrations" 2>/dev/null || true)"

if [[ "$history_count" == "" ]]; then
  history_count=0
fi

if [[ "$history_count" != "0" ]]; then
  pnpm --filter @workspace/db run migrate
  exit 0
fi

table_count="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
  "select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'artcovr_%'")"

if [[ "$table_count" == "0" ]]; then
  pnpm --filter @workspace/db run migrate
  exit 0
fi

schema_matches="$(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "
  with expected(table_name, column_name) as (values
    ('artcovr_credit_ledger','id'), ('artcovr_credit_ledger','account_key'),
    ('artcovr_credit_ledger','order_id'), ('artcovr_credit_ledger','entry_type'),
    ('artcovr_credit_ledger','amount'), ('artcovr_credit_ledger','reason'),
    ('artcovr_credit_ledger','source_id'), ('artcovr_credit_ledger','stripe_event_id'),
    ('artcovr_credit_ledger','created_at'),
    ('artcovr_generations','id'), ('artcovr_generations','artwork_id'),
    ('artcovr_generations','clerk_user_id'), ('artcovr_generations','purchase_id'),
    ('artcovr_generations','parent_generation_id'), ('artcovr_generations','reference_upload_id'),
    ('artcovr_generations','phase'), ('artcovr_generations','status'),
    ('artcovr_generations','allowance_slot'), ('artcovr_generations','prompt'),
    ('artcovr_generations','source_object_key'), ('artcovr_generations','preview_object_key'),
    ('artcovr_generations','clean_object_key'), ('artcovr_generations','provider_request_id'),
    ('artcovr_generations','provider_usage'), ('artcovr_generations','error_code'),
    ('artcovr_generations','started_at'), ('artcovr_generations','finished_at'),
    ('artcovr_generations','expires_at'), ('artcovr_generations','created_at'),
    ('artcovr_inquiries','id'), ('artcovr_inquiries','clerk_user_id'),
    ('artcovr_inquiries','email'), ('artcovr_inquiries','name'),
    ('artcovr_inquiries','message'), ('artcovr_inquiries','created_at'),
    ('artcovr_orders','id'), ('artcovr_orders','clerk_user_id'),
    ('artcovr_orders','artwork_id'), ('artcovr_orders','artwork_slug'),
    ('artcovr_orders','stripe_checkout_session_id'), ('artcovr_orders','stripe_payment_intent_id'),
    ('artcovr_orders','stripe_refund_id'), ('artcovr_orders','stripe_customer_id'),
    ('artcovr_orders','customer_email'), ('artcovr_orders','idempotency_key'),
    ('artcovr_orders','amount_cents'), ('artcovr_orders','currency'),
    ('artcovr_orders','sale_mode'), ('artcovr_orders','license_terms'),
    ('artcovr_orders','included_credits'), ('artcovr_orders','selected_preview_id'),
    ('artcovr_orders','status'), ('artcovr_orders','reservation_expires_at'),
    ('artcovr_orders','created_at'), ('artcovr_orders','paid_at'),
    ('artcovr_orders','refunded_at'), ('artcovr_orders','entitlement_expires_at'),
    ('artcovr_orders','access_revoked_at'), ('artcovr_orders','access_revocation_reason'),
    ('artcovr_reference_uploads','id'), ('artcovr_reference_uploads','clerk_user_id'),
    ('artcovr_reference_uploads','artwork_id'), ('artcovr_reference_uploads','object_key'),
    ('artcovr_reference_uploads','sha256'), ('artcovr_reference_uploads','width'),
    ('artcovr_reference_uploads','height'), ('artcovr_reference_uploads','bytes'),
    ('artcovr_reference_uploads','created_at'), ('artcovr_reference_uploads','uploaded_at'),
    ('artcovr_reference_uploads','consumed_at'), ('artcovr_reference_uploads','expires_at'),
    ('artcovr_webhook_events','id'), ('artcovr_webhook_events','type'),
    ('artcovr_webhook_events','status'), ('artcovr_webhook_events','received_at'),
    ('artcovr_webhook_events','processed_at')
  )
  select count(*) = 0
  from expected
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = expected.table_name
   and c.column_name = expected.column_name
  where c.column_name is null
")"

if [[ "$schema_matches" != "t" ]]; then
  echo "Existing development schema does not match the initial migration; refusing to baseline it." >&2
  echo "Inspect the drift and repair it explicitly before rerunning post-merge setup." >&2
  exit 11
fi

hash="$(sha256sum "$first_migration" | awk '{print $1}')"
created_at="$(date +%s%3N)"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
begin;
insert into drizzle.__drizzle_migrations (hash, created_at)
select '$hash', $created_at
where not exists (
  select 1 from drizzle.__drizzle_migrations where hash = '$hash'
);
commit;
SQL

echo "Adopted the existing development schema as the initial Drizzle migration; no application tables or rows were changed."
pnpm --filter @workspace/db run migrate