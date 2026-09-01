# Database verification (gate G8)

Two suites, one runner. Together they are gate **G8** in
`.agent-state/RELEASE_GATES.md`.

| File | Proves |
| :--- | :--- |
| `contract_invariants.sql` | **Shape** — tables, columns, enum types, RPC entrypoints, indexes, grants, RLS |
| `behaviour_checks.sql` | **Behaviour** — that the guards in `.agent-state/FAILURE_GRAPH.md` hold when exercised |
| `bootstrap_supabase_shim.sql` | Test-only scaffolding so the migrations can apply to stock PostgreSQL |
| `verify-contract.ps1` | Static schema check, no database required. Does **not** replace this. |

## Running it

```bash
PGHOST=127.0.0.1 PGPORT=5433 PGUSER=postgres bun run db:verify
```

That creates a scratch database, applies every migration in order, runs both
suites, and drops it. Non-zero exit is a real defect. It also runs on every push
via the `database` job in `.github/workflows/ci.yml`, against a PostgreSQL 16
service container.

**Never point it at production.** It creates a database and writes rows.

Local PostgreSQL 16, if you need one:

```bash
apt-get install -y postgresql
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | head -1)
mkdir -p /tmp/pgdata && chown postgres:postgres /tmp/pgdata
su postgres -c "$PGBIN/initdb -D /tmp/pgdata -A trust"
su postgres -c "$PGBIN/pg_ctl -D /tmp/pgdata -l /tmp/pg.log -o '-p 5433' start"
```

## What the shim is, and what it is not

`bootstrap_supabase_shim.sql` creates only what the migrations reference: the
three PostgREST roles (`anon`, `authenticated`, `service_role`), `auth.users`
plus `auth.uid()`/`auth.role()`, and the two `storage` tables. It is **not** a
Supabase emulator. A green run proves the migrations parse, apply, and that the
SQL logic they define behaves correctly. It proves nothing about Supabase-managed
behaviour — GoTrue, PostgREST's own role switching, Storage's signed URLs.

## The limit that matters most

**A green run here says nothing about what is applied to the live project.**
These suites build a database from the migration files. A production database
that never received migration `202608140010` will still be missing dual-lane
generation admission while this gate is green. `.agent-state/ULTRAPLAN.md` task 4
tracks exactly that question. Only inspecting the live database answers it.

## Why this exists

Until 2026-08-31 G8 had never been executed — it needs a real database and
nobody had stood one up. Running it for the first time immediately found that
`contract_invariants.sql` asserted the **7-argument** `request_generation`, which
migration `202608250012_reference_uploads.sql` had dropped and replaced with an
8-argument form. The suite would have failed against any correctly migrated
database, and had been failing silently since 2026-08-25, because nothing ran it.

That is the argument for the CI job: a gate nobody runs is not a gate.
