# RELEASE GATES — ARTCOVR

All release gates must pass before any version is marked production-ready.

| Gate | Requirement | Command / Check | Status (2026-08-14) |
| :--- | :--- | :--- | :--- |
| **G1: Unit & Contract Tests** | 100% test pass | `npm test` | **PASS** (116/116, 1 skipped) |
| **G2: TypeScript Compilation** | Zero type errors | `npm run typecheck` | **PASS** |
| **G3: Code Quality & Lint** | Zero ESLint warnings / errors | `npm run lint` | **PASS** |
| **G4: Production Build** | Zero build errors; export pruned to approved assets | `npm run build` | **PASS** (0 unapproved assets/URLs in `out/`) |
| **G5: Browser & E2E Tests** | All Playwright journeys pass | `npm run test:e2e` | **PASS** (42/42, desktop + mobile) |
| **G6: Catalog Integrity** | Projection matches approved records | `npm run catalog:project:check` | **PASS** (0 approved → empty projection, synchronized) |
| **G7: Security Headers** | CSP, X-Frame-Options, noindex on staging | Automated contract test + `public/_headers` | **PASS** |
| **G8: Commerce Hardening** | Frozen prices, idempotent settle, dispute revoke/restore, convergent webhooks | Backend tests + migrations 0001–0009 applied on disposable PG16 with behavioral checks | **PASS** (locally; live Supabase must apply 0009) |
| **G9: Display Asset Integrity** | 100 JPEG, square display derivatives; curated/seed sha sync | `tests/unit/catalog-display-assets.test.ts` | **PASS** |

## Launch blockers that are OWNER decisions, not engineering defects
1. **EMPTY_APPROVAL_SET** — 0 of 100 curated works have rights/pricing approval. The public storefront correctly renders the pre-launch empty state until `catalog:approval:import` produces a non-empty `approved-artworks.json` and `catalog:project` regenerates `curated-public.json`. Launch gate: `npm run catalog:launch:check` (requires 100–200 approved).
2. **Live Supabase deployment** — apply `202608140009_convergence_hardening.sql`; enable `charge.dispute.closed` in the Stripe webhook endpoint; verify `OPENAI_IMAGE_TIMEOUT_MS <= 130000`; provision both watchdog cron jobs per `supabase/README.md`.
3. **Storage upload** — `catalog:storage:plan` + apply requires the owner's private source tree (E:\ART_COLLECTION) and service-role credentials.
