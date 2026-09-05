#!/usr/bin/env bash
# Adopt a legacy Drizzle-push schema in development without replaying its DDL.
#
# This is intentionally separate from `db:migrate`: a fresh database must
# apply the committed migration, while an old development database already
# has the tables and rows created by the former push flow.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

if [[ "${NODE_ENV:-}" != "development" ]]; then
  echo "DB BASELINE REFUSED: NODE_ENV must be exactly 'development'." >&2
  echo "Run this one-time adoption only with: NODE_ENV=development pnpm run db:baseline" >&2
  exit 2
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required to baseline an existing development database." >&2
  exit 2
fi

command -v psql >/dev/null || {
  echo "psql is required to baseline an existing development database." >&2
  exit 2
}

drizzle_dir="$root/lib/db/drizzle"
journal="$drizzle_dir/meta/_journal.json"
mapfile -t migration_files < <(find "$drizzle_dir" -maxdepth 1 -type f -name '*.sql' -print | sort)
if [[ ! -s "$journal" || "${#migration_files[@]}" -eq 0 ]]; then
  echo "DB BASELINE REFUSED: committed Drizzle migration history is incomplete." >&2
  exit 2
fi

# A legacy database can only be adopted at the first migration. Any later
# migrations are applied normally by `db:migrate` after this marker is added.
first_migration="${migration_files[0]}"
migration_hash="$(sha256sum "$first_migration" | awk '{print $1}')"
migration_created_at="$(sed -n 's/.*"when":[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$journal" | head -1)"
if [[ ! "$migration_hash" =~ ^[[:xdigit:]]{64}$ || ! "$migration_created_at" =~ ^[0-9]+$ ]]; then
  echo "DB BASELINE REFUSED: could not read the first migration metadata." >&2
  exit 2
fi

history_table_exists="$(
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "
    select case
      when to_regclass('drizzle.__drizzle_migrations') is null then 'no'
      else 'yes'
    end
  "
)"

if [[ "$history_table_exists" == "yes" ]]; then
  history_row_count="$(
    psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc \
      "select count(*) from drizzle.__drizzle_migrations"
  )"
  if [[ "$history_row_count" != "0" ]]; then
    echo "DB BASELINE SKIPPED: Drizzle migration history already exists; no writes performed."
    exit 0
  fi
elif [[ "$history_table_exists" != "no" ]]; then
  echo "DB BASELINE REFUSED: could not determine Drizzle migration history state." >&2
  exit 2
fi

# Use the committed migration itself to build temporary tables. Comparing the
# catalogs avoids duplicating a column list here and keeps recognition aligned
# with the reviewable migration. The transaction rolls back and the temporary
# tables disappear when this psql session ends.
legacy_schema_state="$(
  {
    cat <<'SQL'
begin;
set local search_path = pg_temp;
SQL
    cat "$first_migration"
    cat <<'SQL'

with expected_tables as (
  select c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.oid = pg_my_temp_schema()
    and c.relkind = 'r'
    and c.relname like 'artcovr_%'
),
actual_tables as (
  select c.relname as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname like 'artcovr_%'
),
expected_columns as (
  select c.relname as table_name, a.attname as column_name,
         format_type(a.atttypid, a.atttypmod) as data_type,
         a.attnotnull as not_null,
         coalesce(pg_get_expr(d.adbin, d.adrelid), '') as default_expression
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.oid = pg_my_temp_schema()
    and c.relkind = 'r'
    and c.relname like 'artcovr_%'
    and a.attnum > 0
    and not a.attisdropped
),
actual_columns as (
  select c.relname as table_name, a.attname as column_name,
         format_type(a.atttypid, a.atttypmod) as data_type,
         a.attnotnull as not_null,
         coalesce(pg_get_expr(d.adbin, d.adrelid), '') as default_expression
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname like 'artcovr_%'
    and a.attnum > 0
    and not a.attisdropped
),
expected_indexes as (
  select i.relname as index_name, x.indisunique,
         regexp_replace(pg_get_indexdef(x.indexrelid),
           '(pg_temp(_[0-9]+)?|public)\.', '', 'g') as index_definition
  from pg_class t
  join pg_namespace tn on tn.oid = t.relnamespace
  join pg_index x on x.indrelid = t.oid
  join pg_class i on i.oid = x.indexrelid
  where tn.oid = pg_my_temp_schema()
    and t.relkind = 'r'
    and t.relname like 'artcovr_%'
),
actual_indexes as (
  select i.relname as index_name, x.indisunique,
         regexp_replace(pg_get_indexdef(x.indexrelid),
           '(pg_temp(_[0-9]+)?|public)\.', '', 'g') as index_definition
  from pg_class t
  join pg_namespace tn on tn.oid = t.relnamespace
  join pg_index x on x.indrelid = t.oid
  join pg_class i on i.oid = x.indexrelid
  where tn.nspname = 'public'
    and t.relkind = 'r'
    and t.relname like 'artcovr_%'
),
table_difference as (
  (select * from expected_tables except select * from actual_tables)
  union all
  (select * from actual_tables except select * from expected_tables)
),
column_difference as (
  (select * from expected_columns except select * from actual_columns)
  union all
  (select * from actual_columns except select * from expected_columns)
),
index_difference as (
  (select * from expected_indexes except select * from actual_indexes)
  union all
  (select * from actual_indexes except select * from expected_indexes)
)
select case
  when not exists (select 1 from table_difference)
   and not exists (select 1 from column_difference)
   and not exists (select 1 from index_difference)
  then 'legacy-ready'
  when not exists (select 1 from actual_tables)
  then 'fresh'
  else 'schema-mismatch'
end;
rollback;
SQL
  } | psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -At
)"

if [[ "$legacy_schema_state" == "fresh" ]]; then
  echo "DB BASELINE SKIPPED: no legacy commerce schema found; committed migrations will initialize this development database."
  exit 0
elif [[ "$legacy_schema_state" != "legacy-ready" ]]; then
  if [[ "$legacy_schema_state" == "schema-mismatch" ]]; then
    echo "DB BASELINE REFUSED: existing development tables do not match the first committed migration." >&2
    echo "No tables, rows, or migration history were changed." >&2
  else
    echo "DB BASELINE REFUSED: could not recognize the existing development schema." >&2
  fi
  exit 1
fi

# Re-check history while holding a transaction-scoped advisory lock. This
# makes concurrent post-merge setup runs harmless and avoids adding a marker
# after another migration has already started.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v migration_hash="$migration_hash" \
  -v migration_created_at="$migration_created_at" <<'SQL'
begin;
select pg_advisory_xact_lock(hashtextextended('artcovr-development-baseline', 0));
create schema if not exists drizzle;
create table if not exists drizzle.__drizzle_migrations (
  id serial primary key,
  hash text not null,
  created_at bigint
);
do $$
begin
  if exists (select 1 from drizzle.__drizzle_migrations) then
    raise exception 'migration history appeared while baseline was being prepared';
  end if;
end
$$;
insert into drizzle.__drizzle_migrations (hash, created_at)
select :'migration_hash', :migration_created_at::bigint
where not exists (select 1 from drizzle.__drizzle_migrations);
commit;
SQL

echo "DB BASELINE APPLIED: recognized the existing development schema and recorded ${migration_hash}; no commerce tables or rows were changed."