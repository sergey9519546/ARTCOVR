# Database migrations

This directory is the reviewable schema history for `@workspace/db`.

- Generate a migration after changing `lib/db/src/schema` with
  `pnpm --filter @workspace/db run generate`.
- Apply committed migrations to a development or disposable database with
  `pnpm run db:migrate`.
- Post-merge setup uses `scripts/db/migrate-development.sh`. It first checks
  whether a development database has the initial schema but no Drizzle
  history, records only the baseline migration metadata when appropriate, and
  then applies committed migrations. It never drops or rewrites application
  data.
- Adopt a legacy development database created by the old push flow once with
  `NODE_ENV=development pnpm run db:baseline`. This compares the existing
  tables and indexes with the first committed migration, records only the
  migration marker, and then lets `pnpm run db:migrate` apply any later
  migrations. It leaves fresh databases for `pnpm run db:migrate` and refuses
  partial, mismatched, or non-development databases.
- Run `pnpm run verify:database` to perform a read-only connectivity, migration
  history, and commerce-table check.

New development and CI databases should skip the baseline command and start
with `pnpm run db:migrate`. Do not point migration or baseline commands at
production. Production schema changes go through the Replit publish flow; the
verification command never performs DDL.
