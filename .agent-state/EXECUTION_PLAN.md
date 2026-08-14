# EXECUTION PLAN — PRODUCT CONVERGENCE

## Phase 1: Reconstruct Reality & State Integrity [COMPLETED]
- [x] Establish ground truth from codebase, tests, git commits, configuration, and dependencies.
- [x] Identify failing unit tests:
  - Visual parity contract regression (`globals.css`, `useTheme.ts`, `ThemeSwitcher.tsx`).
  - Motion accessibility contract regression.
  - Intro artworks diversity selection.
  - Partial-catalog/non-scripted rendering (`hasRange(4, 7)` absence in `ProductGrid.tsx`).
- [x] Fix theme token contracts (`red` theme variants, CSS tokens, useTheme preferences).
- [x] Fix `pickIntroArtworks` category round-robin selection in `src/lib/artcovr/artworks.ts`.
- [x] Add `hasRange(4, 7)` partial-catalog guard + `@media (scripting: none)` coverage in `ProductGrid.tsx`.
- [x] Achieve 100% pass on all 105 unit and contract tests (`npm test`).

## Phase 2: Architecture & Memory Persistence [COMPLETED]
- [x] Create `AGENTS.md` and `GEMINI.md`.
- [x] Create `.agents/rules/` (`godmode-constitution.md`, `production-safety.md`, `frontend-quality.md`).
- [x] Create `.agents/hooks.json`.
- [x] Create `.agent-state/SYSTEM_MAP.md`, `PRODUCT_CONTRACT.md`, `FAILURE_GRAPH.md`, `DECISIONS.md`, `RELEASE_GATES.md`.

## Phase 3: Static Analysis & Compilation Gates [COMPLETED]
- [x] Verify TypeScript type checking (`npm run typecheck`) → 0 errors.
- [x] Verify ESLint code quality (`npm run lint`) → 0 errors, 0 warnings.
- [x] Verify Next.js production build (`npm run build`) → 119/119 static and SSG routes compile cleanly.

## Phase 4: Browser Runtime & E2E Validation [COMPLETED]
- [x] Free port conflicts and remove stale `.next/dev/lock`.
- [x] Run full Playwright test suite against clean local dev server with `NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING=1`.
- [x] Verify complete customer journeys:
  - Homepage full interaction & animations
  - Archive search and responsive card grid (100 products)
  - Product detail & license terms
  - Checkout initiation & idempotency
  - My Images generation studio & status polling
  - Static legal & informational routes
- [x] Verify 42/42 Playwright E2E browser tests pass cleanly across Desktop and Mobile Chromium.

## Phase 5: Adversarial Review & Final Release Gate [COMPLETED]
- [x] Run release gates check (`npm run verify`) → 100% passing across 105 tests, tsc, eslint, and next build.
- [x] Perform security and commerce premortem.
- [x] Document changes, evidence matrix, and validation in `walkthrough.md`.
