@AGENTS.md

# CLAUDE.md — Claude-Specific Deltas

See [AGENTS.md](AGENTS.md) for root product contracts, security invariants, architectural requirements, and verification gates.

## Claude Commands Quick Reference

Bun is canonical — never invoke npm, Yarn, or pnpm (AGENTS.md forbids their lockfiles).
`package.json` is command truth; the list below is a convenience index, not a substitute.

- Standard verification: `bun run verify` — runs `bun run test`, `typecheck`, `lint`,
  `catalog:validate`, `catalog:project:check`, `catalog:search:check`, `build`.
  Note this does **not** include Playwright.
- Portable verification: `bun run verify:ci` — the same set with `catalog:search:check`
  swapped for `catalog:launch:check`. Use this anywhere the private semantic-lab tree is
  absent; it is what CI runs.
- Unit and contract tests: `bun run test`
- Browser e2e journeys: `bun run test:e2e`
- Catalog projection: `bun run catalog:project`
- Catalog projection check: `bun run catalog:project:check`
- Launch readiness check: `bun run catalog:launch:check`

## Environment Note

`bun run verify` cannot pass off the owner's machine as-is. `catalog:search:check` — and
the `build-search-index.ts` determinism test — rebuild the search index from the private
curation tree that defaults to `E:\ART_COLLECTION\.artcovr-curation\semantic-lab`. Point
`ARTCOVR_SEMANTIC_LAB_DIR` at that tree to run them, or use `bun run verify:ci`, which
excludes the checks that require it. Both paths now fail (or skip) with an explicit reason
rather than an ENOENT naming a drive that does not exist locally.
