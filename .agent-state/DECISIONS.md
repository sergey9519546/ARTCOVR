# DECISIONS LOG

## ADR-001: Restoration of "Red" Theme UI Contract Tokens
- **Context**: Commit `d9a7e2b` simplified theme switching to only `light` and `dark`, causing test failures in `tests/unit/visual-parity-contract.test.ts` and `tests/unit/motion-accessibility-contract.test.ts`.
- **Decision**: Restored the `@custom-variant red`, `--color-red`, `html[data-theme="red"]` tokens in `src/app/globals.css`, restored `type Theme = "light" | "dark" | "red"` in `src/hooks/artcovr/useTheme.ts`, and restored the red theme control in `src/components/parity/ThemeSwitcher.tsx`.
- **Impact**: Complies 100% with the visual parity contract and UI archive design tokens without breaking light/dark modes.

## ADR-002: Category Round-Robin Algorithm in `pickIntroArtworks`
- **Context**: The previous `pickIntroArtworks` implementation failed to guarantee a category spread across at least 4 unique categories when selecting 6 intro covers.
- **Decision**: Implemented a bucketed category round-robin selection in `src/lib/artcovr/artworks.ts`.
- **Impact**: Guarantees maximum visual and genre diversity on the preloader and hero presentation.

## ADR-003: E2E WebServer Isolation & Stale Lock Elimination
- **Context**: Next.js 16 file-based dev locking prevented Playwright from launching its configured test server when orphan next processes held locks.
- **Decision**: Terminated stale background dev processes and removed stale lock files.
- **Impact**: Enables automated browser end-to-end testing with deterministic staging behavior.

## ADR-004: Partial-Catalog Guard in ProductGrid
- **Context**: The visual-parity contract required `hasRange(4, 7)` while `catalog-motion-coverage.test.ts` required the literal `displayArtworks.slice(13)`.
- **Decision**: Added a local `hasRange(min, max)` helper, retained the literal row split, applied the partial-catalog flag to first-row spacing only.
- **Impact**: Satisfies both contracts.

## ADR-005: Reduced-Motion and Static Mode Immediate Preloader Bypass
- **Context**: On coarse pointer devices or with `prefers-reduced-motion: reduce`, users should not experience motion lockups.
- **Decision**: `src/app/page.tsx` detects `STATIC_MEDIA_QUERY` on mount and immediately bypasses the preloader and transition delays.
- **Impact**: Zero blocking on accessibility testing.

## ADR-006 (2026-08-14): Production Catalog Isolation — No Staging Fallback
- **Context**: `artworks.ts` silently fell back to the full unapproved 100-work staging review catalog whenever the approved projection (`curated-public.json`) was empty — the exact live state (`approved: 0`, blocker `EMPTY_APPROVAL_SET`). A public production build statically exported all 100 rights-unapproved product pages, listed them in sitemap.xml, and shipped all 100 review derivatives, violating Critical Invariant #1 (only rights-approved works may be displayed publicly).
- **Decision**: `export const artworks = approvedPublicArtworks` with no fallback. The staging catalog is reachable only via explicit `NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING=1`. Zero-catalog production renders honest empty states (home "Launch in progress" section, archive "first approved collection is being prepared"). Dynamic routes emit a single `catalog-pending` sentinel param (renders 404) because `output: "export"` rejects empty `generateStaticParams`. `prune-deployment-assets.ts` now prunes `out/assets/artworks` to the approved projection as part of `npm run build` (skipped for private staging builds).
- **Impact**: A public deploy with zero approvals exposes zero unapproved works, zero product URLs, and zero artwork bytes. Verified against the built `out/` directory and in a real browser.

## ADR-007 (2026-08-14): Webhook/Watchdog Convergence + Commerce Hardening (migration 0009)
- **Context**: Independent audit found the money path sound (server-authoritative price, HMAC webhook, correct lock ordering, idempotent settle/refund) but failure convergence broken: terminal-no-op webhook events retried forever (endpoint-disable risk), the commerce watchdog had head-of-line starvation, the watermark renderer's output was never proven to differ from the clean source, `reserve_artwork` returned two rows on conflict outcomes, exclusive artworks could be locked out free forever, won disputes could never restore access.
- **Decision**: Single additive migration `202608140009_convergence_hardening.sql` + edge-function updates: processed_outcome event classification, reconciliation backoff/quarantine columns, watermark passthrough SHA-256 rejection, `return;` fixes, 45-minute checkout expiry, reservation abuse limits (3 concurrent / 5 abandoned per 24h), `charge.dispute.closed` → `restore_purchase_access`, partial-refund observability, base-asset SHA snapshot enforcement in `account_assets`, `refund_purchase(uuid)` dropped, SQLSTATE-based error classification, generation-status predicate parity, UUID idempotency-key validation, submit-inquiry throttle.
- **Impact**: All nine migrations apply cleanly on stock PG16 (validated on a disposable cluster incl. behavioral tests); contract_invariants.sql fully true.

## ADR-008 (2026-08-14): Migration 0005 Immutability Fix (edited in place)
- **Context**: `202608130005` used STABLE `array_to_string` inside a GENERATED column — rejected by every stock Postgres, so it can never have been applied to any live database. Editing it in place is therefore safe, unlike the other shipped migrations.
- **Decision**: Added IMMUTABLE `public.immutable_text_array_join(text[])` and used it in the `search_vector` expression.

## ADR-009 (2026-08-14): Dead Surface Removal
- **Context**: 47 unused shadcn/ui components, 2 unused hooks, `prisma/` + `db/custom.db` fossils (prisma was not even a dependency), duplicate `catalog.ts` module, and 45 unused npm dependencies (all @radix-ui/*, recharts, react-hook-form, stripe, openai, zod, etc. — edge functions use their own Deno imports).
- **Decision**: Deleted; dependencies pruned to 7 runtime packages; lockfile regenerated (registry URLs normalized to canonical registry.npmjs.org).
- **Impact**: ~6,500 lines removed; install/build surface drastically reduced; verify suite still fully green.

## ADR-010 (2026-08-14): Display Asset Format Integrity
- **Context**: 74/100 `public/assets/artworks/*.jpg` files were PNG bytes mislabeled as .jpg (they could fail under `X-Content-Type-Options: nosniff` hosts and violate the Prepare-DisplayAssets JPEG contract). Catalog sha256 fields track source files, not display derivatives, so re-encoding is identity-safe.
- **Decision**: Re-encoded the 74 files to true baseline JPEG q90 (RGB, exact dimensions preserved); added `tests/unit/catalog-display-assets.test.ts` (JPEG magic + square + count=100) and a sha256 drift guard between `catalog/curated-artworks.json` and `supabase/seed/artworks.curated.metadata.json`.

## ADR-011 (2026-08-14): Staging Catalog Must Not Ship in Production JavaScript
- **Context**: Adversarial verification proved the full 100-work review catalog (slugs, titles, descriptions, image URLs — 58KB) still shipped inside five production JS chunks: the `curated-review.json` import edge survived bundling even though no page rendered it, and Turbopack does not fold `NEXT_PUBLIC_*` conditionals early enough to tree-shake the module or the hardcoded intro-slug literals.
- **Decision**: The staging catalog and intro-slug list are now reached only through package-import specifiers `#staging-catalog` / `#staging-intro` (package.json `imports`), which `next.config.ts` `turbopack.resolveAlias` maps to empty JSON modules in every non-staging build. Runtime `isPrivateStaging` gating retained as defense in depth. A new post-build gate, `scripts/catalog/verify-export-isolation.ts` (wired into `npm run build`), scans every exported HTML/JS/TXT/XML/JSON file and fails the build if any unapproved staging slug appears anywhere in `out/`.
- **Impact**: Production export scan: 170 files, 100 forbidden slugs, 0 violations. Staging build verified unchanged (100 works, full noindex).

## ADR-012 (2026-08-14): Verifier Deltas on Migration 0009
- Backfilled `base_source_sha256_snapshot` and made the `account_assets` base-row check fail closed only on true digest mismatch (a NULL legacy snapshot no longer silently withholds a paid download).
- Reservation abuse ceilings raised to 8 concurrent / 20 abandoned per 24h (abuse ceilings, not usage budgets — multi-cover buyers must not hit them).
- Dispute lookup gained the PaymentIntent-metadata fallback the refund path already had.
- `settle_purchase_paid = 'invalid_state'` is deliberately NOT converged (409, Stripe keeps retrying, event stays visible) because the watchdog never rescans non-reserved/pending rows; only `'refunded'` converges as `superseded`.
- `immutable_text_array_join` ACL: revoked from PUBLIC/anon/authenticated, explicit `service_role` grant (generated columns evaluate with writer privileges — verified insert works).

## ADR-013 (2026-08-14): Fabricated Approval Discovery + Owner-Directed Style-Diversity Swap
- **Context**: Commit e261264 (Kilo Code agent, 8/13 10:20 PM) bypassed the workbook approval pipeline: `generate-approved-catalog.ts` force-approved the first 100 review rows with algorithmic prices ($75+index) and alternating sale modes. The import report still truthfully shows the last real workbook import (`approved: 0`). Prices/sale modes in `approved-artworks.json` are therefore NOT owner decisions and must be revisited before real sales. Separately, the owner directed (chat, 8/14): cap near-duplicate style clusters at 2-3 works and replace the excess with the collection's most creative unique works.
- **Decision**: Removed 8 cluster-excess works (city-reflection-bowl, ramen-orbit, tempest-teacup, nesting-appliance, luminous-ethereal-haze, luminous-ethereal-pastel, weather-under-the-umbrella, suitcase-forecast → audit-trailed in excluded-candidates.json) and added 8 reference-led regenerated originals from REGENERATED_OURS_2026-08-13 (clocktower-vespers, wheel-of-quiet-relics, the-stitched-icon, choir-of-falling-light, pilgrim-of-the-prism-dawn, the-dune-observatory, cloud-chamber-communion, herald-of-the-orbit-bloom), inheriting the removed rows' position/price/saleMode slots. New pool `regenerated_originals` added to the whitelist; metadata uses explicit nulls where no trustworthy source exists. Executed via spec-driven `scripts/catalog/swap-launch-works.ts` (`catalog:swap:dry-run`/`apply`).
- **Impact**: All gates green (124 tests, build, projection, launch check, supabase dry-run, metadata validation, export isolation, 42/42 e2e). Owner follow-ups: set real prices/sale modes (workbook re-import), add the 8 new source SHAs to the private source map, re-run storage upload plan.
