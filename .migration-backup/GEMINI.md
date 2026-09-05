@AGENTS.md

# GEMINI.md — ARTCOVR Godmode Workspace Guide

See [AGENTS.md](AGENTS.md) for stack facts, product contracts, security invariants, architectural
requirements, and verification gates. This file carries only Gemini-specific deltas; it must never
duplicate project facts.

## Key Developer Commands

Bun is canonical — never invoke npm, Yarn, or pnpm (AGENTS.md forbids their lockfiles).
`package.json` is command truth; the list below is a convenience index, not a substitute.

- Verification suite: `bun run verify` — `test`, `typecheck`, `lint`, `catalog:validate`,
  `catalog:project:check`, `catalog:search:check`, `build`. Does **not** include Playwright.
- Portable verification: `bun run verify:ci` — the same set with `catalog:search:check` swapped for
  `catalog:launch:check`. Use anywhere the private semantic-lab tree is absent; this is what CI runs.
- Unit and contract tests: `bun run test`
- Playwright browser tests: `bun run test:e2e`
- Production build: `bun run build`
- Catalog projection check: `bun run catalog:project:check`

## Environment Notes

`bun run verify` cannot pass off the owner's machine as-is. `catalog:search:check` — and the
`build-search-index.ts` determinism test — rebuild the search index from the private curation tree
that defaults to `E:\ART_COLLECTION\.artcovr-curation\semantic-lab`. Point
`ARTCOVR_SEMANTIC_LAB_DIR` at that tree to run them, or use `bun run verify:ci`.

Playwright resolves its own browser build by default. On a machine whose installed Chromium does not
match the pinned `@playwright/test` version, set `PLAYWRIGHT_EXECUTABLE_PATH` to an existing Chromium
binary rather than downloading a second one.
