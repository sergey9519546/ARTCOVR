# DECISIONS LOG

## ADR-001: Restoration of "Red" Theme UI Contract Tokens
- **Context**: Commit `d9a7e2b` simplified theme switching to only `light` and `dark`, causing test failures in `tests/unit/visual-parity-contract.test.ts` and `tests/unit/motion-accessibility-contract.test.ts`.
- **Decision**: Restored the `@custom-variant red`, `--color-red`, `html[data-theme="red"]` tokens in `src/app/globals.css`, restored `type Theme = "light" | "dark" | "red"` in `src/hooks/artcovr/useTheme.ts`, and restored the red theme control in `src/components/parity/ThemeSwitcher.tsx`.
- **Impact**: Complies 100% with the visual parity contract and UI archive design tokens without breaking light/dark modes.

## ADR-002: Category Round-Robin Algorithm in `pickIntroArtworks`
- **Context**: The previous `pickIntroArtworks` implementation failed to guarantee a category spread across at least 4 unique categories when selecting 6 intro covers.
- **Decision**: Implemented a bucketed category round-robin selection in `src/lib/artcovr/artworks.ts` that iterates through available distinct categories first before filling remaining slots.
- **Impact**: Guarantees maximum visual and genre diversity on the preloader and hero presentation.

## ADR-003: E2E WebServer Isolation & Stale Lock Elimination
- **Context**: Next.js 16 file-based dev locking (`.next/dev/lock`) prevented Playwright from launching its configured test server when orphan next processes held locks.
- **Decision**: Terminated stale background dev processes and removed stale lock files, allowing Playwright's integrated `webServer` runner to boot with full staging environment variables (`NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING=1`).
- **Impact**: Enables 100% automated browser end-to-end testing with deterministic staging behavior.

## ADR-004: Partial-Catalog Guard in ProductGrid
- **Context**: The visual-parity contract required `hasRange(4, 7)` to exist in `src/components/parity/ProductGrid.tsx` for "home remains usable for partial catalogs and non-scripted rendering", but the literal `displayArtworks.slice(13)` slicing was also required by `catalog-motion-coverage.test.ts`.
- **Decision**: Added a local `hasRange(min, max)` helper that tests `displayArtworks.length` against `[4, 7]`, retained the literal `displayArtworks.slice(13)` row split unchanged, and applied the partial-catalog flag only to first-row spacing (`mb-6/8` vs `mb-10/12`).
- **Impact**: Satisfies both contracts; partial catalogs (4–7 items) render with tighter spacing while the full 100-item launch grid keeps its editorial 13+row split.
