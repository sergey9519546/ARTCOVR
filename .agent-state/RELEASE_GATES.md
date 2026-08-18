# RELEASE GATES — ARTCOVR

All release gates must pass before any version is marked production-ready.

| Gate | Requirement | Command / Check | Status (2026-08-18) |
| :--- | :--- | :--- | :--- |
| **G1: Unit & Contract Tests** | 100% test pass | `npm test` | **PASS** (145 pass, 0 fail, 0 skip) |
| **G2: TypeScript Compilation** | Zero type errors | `npm run typecheck` | **PASS** |
| **G3: Code Quality & Lint** | Zero ESLint warnings / errors | `npm run lint` | **PASS** (`@typescript-eslint/no-unused-vars` enabled; remaining rules deferred with written reasons per ULTRAPLAN task 8) |
| **G4: Production Build** | Zero build errors; export pruned to approved assets | `npm run build` | **PASS** (139 published, 0 removed; 2656 files scanned, 0 forbidden slugs, 0 violations) |
| **G5: Browser & E2E Tests** | All Playwright journeys pass | `npm run test:e2e` | **PASS** (42/42, desktop + mobile) |
| **G6: Catalog Integrity** | Projection matches approved records | `npm run catalog:project:check`, `npm run catalog:launch:check` | **PASS** (169 approved → 139 projected, 30 delete-tier excluded, `launchCountValid: true`; pricing overrides wired via `catalog/pricing-overrides.json` + ADR-020) |
| **G7: Security Headers** | CSP, X-Frame-Options, noindex on staging | Automated contract test + `vercel.json` headers | **PASS** |
| **G8: Commerce Hardening** | Frozen prices, idempotent settle, dispute revoke/restore, convergent webhooks, dual-lane generation admission, dispute-pause entitlement credit, base-drift reconciliation | Backend tests + migrations 0001–0011 applied on disposable PG16 with behavioral checks | **PASS** (locally; live Supabase rolled out 0001–0011 on 2026-08-15: 6 public base tables verified, frozen `restore_purchase_access` intact, 3 new `0011` RPCs present, RLS enabled on artworks+purchases, watchdog crons firing HTTP 200, `entitlement_paused_at`+`base_snapshot_prior` columns live) |
| **G9: Display Asset Integrity** | JPEG, square display derivatives; curated/seed sha sync | `tests/unit/catalog-display-assets.test.ts` | **PASS** |
## Launch blockers that are OWNER decisions, not engineering defects
1. **FABRICATED_PRICING_APPROVAL** — **RESOLVED (ADR-019, 2026-08-15)**: Owner confirmed the four-tier pricing ($10/$35/$80/$200; 30 exclusive/70 repeatable at launch, now 51 exclusive/118 repeatable across 169) as owner-approved. No longer a launch blocker. See ADR-019.
2. **Stripe webhook event enablement** — enable the `charge.dispute.closed` event on the Stripe webhook endpoint via the Stripe dashboard. Migration `202608140009_convergence_hardening.sql` is applied live, the edge function handles the event, and both watchdog crons are provisioned and firing HTTP 200 every minute. `OPENAI_IMAGE_TIMEOUT_MS` is auto-satisfied (defaults to 115000, under the 130000 watchdog cap). Only the Stripe dashboard toggle remains.
3. **Storage upload** — `catalog:storage:plan` + apply requires the owner's private source tree (E:\ART_COLLECTION) and service-role credentials.

