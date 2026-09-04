# Database migrations

This directory is the reviewable schema history for `@workspace/db`.

- Generate a migration after changing `lib/db/src/schema` with
  `pnpm --filter @workspace/db run generate`.
- Apply committed migrations to a development or disposable database with
  `pnpm run db:migrate`.
- Run `pnpm run verify:database` to perform a read-only connectivity, migration
  history, and commerce-table check.

Do not point migration commands at production. Production schema changes go
through the Replit publish flow; the verification command never performs DDL.