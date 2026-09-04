# ARTCOVR

ARTCOVR is a curated cover-art catalog and storefront with commercial licensing and prompt-based editing.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run verify:ci` — full typecheck plus unit and API tests
- `pnpm run test:e2e` — deterministic storefront Playwright suite; starts isolated API and Vite servers
- `pnpm run verify:release` — portable checks followed by the storefront browser suite
- `pnpm run verify:live-release` — non-mutating smoke checks against `ARTCOVR_RELEASE_URL`; rejects missing/invalid webhooks without creating a payment
- `pnpm run verify:database` — read-only PostgreSQL readiness and required-commerce-table check
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Production API also requires `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ARTCOVR_PUBLIC_ORIGIN`, `ARTCOVR_STOREFRONT_ORIGINS`, and `STRIPE_WEBHOOK_SECRET`. Missing values fail API startup with the variable names.
- The production web artifact is static at `/` and proxies `/api` to the API service. The API startup probe is `/api/healthz`; it checks PostgreSQL readiness rather than only process liveness.
- `VITE_SITE_URL` must be the canonical HTTPS origin only. `BASE_PATH` is currently `/`; changing it requires updating the artifact rewrites and release smoke target together.
- Stripe webhook verification uses the raw request bytes, a configured signing secret, a five-minute timestamp tolerance, and event-id retrieval through the server-side Stripe connector. Duplicate event IDs are ignored transactionally.
- Optional browser-test env: `PLAYWRIGHT_BASE_URL` targets an already-running storefront; otherwise the Playwright config uses isolated local ports. Failure traces and screenshots are retained under `/tmp/artcovr-playwright-results`.
- API trust policy: set `ARTCOVR_PUBLIC_ORIGIN` to the canonical HTTPS storefront
  origin and `ARTCOVR_STOREFRONT_ORIGINS` to the comma-separated browser
  allowlist. State-changing `/api` requests require a matching trusted
  `Origin` or `Referer`; Stripe webhooks are verified separately from their
  raw body and signature.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live
- Web storefront: `artifacts/artcovr`
- API and commerce: `artifacts/api-server`
- PostgreSQL schema: `lib/db/src/schema`
- API contract: `lib/api-spec/openapi.yaml`
- Release checks: `scripts/release` and `scripts/db/verify-database.sh`

## Architecture decisions
- The storefront is static and prerendered; the API is a separate `/api` service.
- Checkout prices and entitlements are derived from server-side catalog data.
- Stripe webhooks require cryptographic signature verification before server-side event retrieval.

## Product
- Browse, search, license, purchase, and edit curated cover artwork.

## User preferences
No standing preferences recorded.

## Gotchas
- `verify:release` is safe for CI and local development; `verify:live-release` is the only check that contacts a deployed URL.
- `verify:database` is read-only. Schema changes use the explicit Drizzle push command and are not silently performed by release checks.

## Pointers
- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
