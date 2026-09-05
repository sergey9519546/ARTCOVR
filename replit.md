# ARTCOVR

ARTCOVR licenses owner-approved cover artwork through a React/Vite storefront,
with an Express API, Clerk authentication, Stripe commerce, and private Replit storage.

## Workspace

- artifacts/artcovr: public storefront and browser tests.
- artifacts/api-server: authenticated customer media and commerce endpoints.
- lib/db: Drizzle schema and additive SQL repairs.
- lib/api-spec, lib/api-zod, lib/api-client-react: shared API contract and generated clients.
- .migration-backup: retained Next.js/Supabase sources and owner-approved catalog inputs.

Use Node 24 and the packageManager-pinned pnpm version. Run pnpm install --frozen-lockfile.
The Replit configuration owns deployment and credentials. Git synchronization does
not apply production migrations or change Replit secrets.

## Verification

Set DATABASE_URL to a disposable PostgreSQL 16 database, PORT=45180, and BASE_PATH=/.
Create its schema with pnpm --filter @workspace/db run push, then run pnpm run verify:ci.
This checks catalog projection, frontend/API tests, all workspace types, and all builds.
The retained Supabase regression gate is pnpm run db:verify (requires psql and PG*).

Run pnpm run test:e2e with a real Clerk test tenant for a local candidate, or set
PLAYWRIGHT_BASE_URL to a Replit preview URL. CI's hosted-smoke job checks the existing
https://artcovr.com deployment. A hosted pass does not prove the candidate is deployed.

## Catalog and database updates

Regenerate the active public catalog with pnpm --filter @workspace/artcovr run catalog:project.
Its approval and pricing inputs live in .migration-backup/catalog. Never hand-edit prices
in the generated public projection or infer commercial rights from technical checks.

The customer API requires lib/db/migrations/20260905_restore_customer_schema.sql.
This additive, transactional repair adds missing customer-media tables and entitlement
columns to the existing commerce schema. It was tested against a disposable original
schema, including a repeated application. Inspect/apply it through Replit's approved
production deployment process; post-merge hooks only install dependencies.
