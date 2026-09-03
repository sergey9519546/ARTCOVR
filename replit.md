# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run verify:ci` — full typecheck plus unit and API tests
- `pnpm run test:e2e` — deterministic storefront Playwright suite; starts isolated API and Vite servers
- `pnpm run verify:release` — portable checks followed by the storefront browser suite
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
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

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
