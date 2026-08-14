# AGENTS.md — ARTCOVR Architecture & Engineering Conventions

## Repository Facts
- **Stack**: Next.js 16 (Turbopack, App Router), React 19, TypeScript 5, Tailwind CSS v4, tw-animate-css.
- **Backend & Database**: Supabase (PostgreSQL with RLS, pg_cron, Vault, Edge Functions (Deno/TypeScript), Storage).
- **Commerce**: Stripe Checkout with Webhooks, idempotent purchase settlements, reservation snapshots, fraud/dispute/refund revocation.
- **AI Pipelines**: Image generation chaining with prompt iterations, rate limiting (global + user-level), raster decoding & dimensions gating (1024x1024 / 2048x2048 WebP).
- **Package Manager & Runtime**: Bun / Node.js.
- **Verification Commands**:
  - `npm test`: Node.js test runner (`node --test --experimental-strip-types`) across 105+ unit/contract tests.
  - `npm run typecheck`: TypeScript compilation check (`tsc --noEmit`).
  - `npm run lint`: ESLint across `src`, `tests`, `scripts` (`eslint src tests scripts --max-warnings=0`).
  - `npm run build`: Next.js production bundle compilation (`next build`).
  - `npm run test:e2e`: Playwright browser e2e testing (`node node_modules/@playwright/test/cli.js test`).
  - `npm run verify`: Full verification pipeline (`npm run test && npm run typecheck && npm run lint && npm run build`).

## Critical Invariants & Rules
1. **Catalog Integrity**: Only rights-approved, owner-verified artworks in `approved-artworks.json` or private staging can be displayed. Clean source originals stay in private storage, never published to `public/`.
2. **Commerce Hardening**:
   - Purchases snapshot artwork metadata (`base_object_key_snapshot`, `base_source_sha256_snapshot`, price at checkout time).
   - SQL settlement locks artwork before purchase rows to avoid race conditions.
   - Refunds and chargebacks revoke clean high-res asset access durably (`access_revoked_at`).
   - Checkout idempotency keys rotate only on terminal rejections.
3. **Theme & Motion Accessibility**:
   - Support `dark`, `light`, and `red` themes with CSS variables and custom variants.
   - Respect `prefers-reduced-motion` and coarse pointer devices; bypass intro motion instantly.
   - Ensure WCAG AA contrast for all buttons and text on every theme background.
