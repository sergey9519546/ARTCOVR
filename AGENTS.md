# ARTCOVR engineering contract

The active product is the pnpm workspace: artifacts/artcovr (React/Vite),
artifacts/api-server (Express), and lib/db (PostgreSQL/Drizzle).
The retired Next.js/Supabase implementation is preserved in .migration-backup;
its scoped instructions apply there. Do not copy its Bun/Next commands into root CI.

Preserve existing user work and branch history. Never force-push or discard work.
Use the pinned pnpm package manager and Node 24. Run pnpm run verify:ci with a
local disposable DATABASE_URL, PORT, and BASE_PATH. Database tests write rows;
never run schema push or tests against production. Run pnpm run test:e2e with
a real Clerk test tenant public key; absent credentials are a blocker, not a pass.

Catalog approval and pricing sources remain in .migration-backup/catalog.
Use pnpm --filter @workspace/artcovr run catalog:project to regenerate the active
public catalog and catalog:project:check to verify it. Never invent commercial
approval, rights, prices, or source provenance. Keep private masters and credentials
out of public assets and commits. Preserve ownership checks, verified webhooks,
exclusive inventory constraints, and fail-closed access to customer media.

Verify code, callers, schema, and tests together. Report unrun checks and live
service limitations explicitly. Production deployment and live schema migration
require owner authorization beyond repository synchronization.
