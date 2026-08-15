# ULTRAPLAN — next 10 tasks

Written 2026-08-15. Ordered by risk: each task assumes the ones above it are done.

## Verified state at time of writing

| Signal | Value |
|---|---|
| `bun run build` | exit 0 — `withheldUnapprovedRows:0`, `violations:0`, 1954 files scanned |
| `bun run test` | **140 / 140 pass, 0 fail** |
| `bun x tsc --noEmit` | clean |
| `bun run lint` | clean |
| HEAD | `29fc687` |
| Uncommitted | 30 modified files |

Everything below assumes that state. Re-run all four gates before starting if time has passed.

---

## 1. Commit the green state — do this first

30 files of audit fixes are uncommitted with every gate green. This is the only moment where "known good" is cheap to capture. One `git checkout .` loses a full session of work across six workstreams.

Split into coherent commits rather than one blob — the diff spans security headers, theme tokens, React lifecycle, GSAP math, and catalog gates.

**Done when:** working tree clean, all four gates still green on the committed tree.
**Risk:** none. Not committing is the risk.

---

## 2. Reconcile the `launch-selection.ts` revert

The rescore was reverted by an actor I cannot attribute — not by any agent I scoped, and it is **not** byte-identical to `launch-selection.PRE-RESCORE.bak`, so it is a *third* variant, not a clean rollback.

It is currently the reason tests pass. That makes it load-bearing and unexplained, which is the worst combination.

- Confirm whether this revert was intentional.
- Diff all three variants: current, `.PRE-RESCORE.bak`, `.PROPOSED.ts`.
- Decide the fate of `catalog/swaps/2026-08-14-collection-rescore.json` (83 works) — apply deliberately, or archive it with a note saying why not.
- Record the decision in `.agent-state/DECISIONS.md`.

**Done when:** one variant is canonical and documented, and the other two are archived or deleted.
**Blocks:** task 3, task 10.

---

## 3. Explain the 19 `generated_images` SHA mismatches

19 of 100 rows carry a `sourceSha256` that matches no `sha256` in `catalog/curated-artworks.json`. All 19 are `generated_images`. The other 81 match, including all 8 `regenerated_originals` (which were the ones expected to differ).

No test covers this, so it passes silently.

Either the catalog stores a derivative hash for that pool (benign, needs documenting) or 19 rows point at source files that are not what shipped (a real identity break in a rights-gated catalog).

**Done when:** the cause is known and either documented or fixed, with a test asserting the invariant either way.

---

## 4. Apply the Supabase migration

`supabase/migrations/202608140010_generation_rate_lanes.sql` exists but **has never been parsed by Postgres**. Until applied, the live `request_generation` is still the broken single-bucket version where free traffic can deny generation to paying customers.

- Apply against staging first; confirm the function replaced cleanly.
- Verify a purchased call succeeds while the free lane is saturated.
- Decide the throughput question: worst case rises 4/min → 8/min (4 free + 4 purchased). If the provider tier cannot absorb 8/min, lower the `>= 4` in the purchased branch — one number, lanes are independent.
- Update `.agent-state/PRODUCT_CONTRACT.md:18` and `FAILURE_GRAPH.md:36`, both of which still document "4/min globally".

**Done when:** applied, verified against a real DB, docs updated.

---

## 5. Resolve the rights contradiction — owner decision, not a code fix

`catalog/approval-import-report.json` reads `"approved": 0, "rejectedOrPending": 100, "blockers": ["EMPTY_APPROVAL_SET"]`, while `approved-artworks.json` and `curated-public.json` carry 100/100 at `rightsApproved: true, published: true` with a commercial licence label. **60 of those published rows still carry `commercial_rights_unconfirmed` and `owner_approval_required` in their own `reviewFlags`.**

This is a commercial storefront. The contradiction is legal exposure, not a lint error.

Three options, all yours:
- **Report only** — the approval happened out-of-band and the ledger is stale. Cheapest, riskiest.
- **Unpublish the 60 flagged rows** until the workbook confirms them. Live catalog drops to 40.
- **Regenerate the approval ledger** against the current 100 so it reflects reality, then act on what it says. Does not itself approve anything.

Note the gates are now fail-closed (task done this session), so nothing *new* can auto-approve — but the existing 100 predate that fix and were not re-validated.

**Done when:** ledger and catalog agree, and no published row contradicts its own reviewFlags.

---

## 6. Untrack the scratch files

`.gitignore` now lists them, but git does not untrack retroactively. Still tracked:

```
src/lib/artcovr/launch-selection.PROPOSED.ts
src/lib/artcovr/launch-selection.PRE-RESCORE.bak
scripts/catalog/swap-launch-works.PRE-RESCORE.bak
scripts/catalog/__pycache__/compute-visual-index.cpython-314.pyc
```

So `.gitignore` currently asserts something false. `.PROPOSED.ts` is excluded from the TS program now, but it is a full duplicate of every `launch-selection` export — an accidental import yields a silently divergent second selection.

Do this **after** task 2, since task 2 may promote one of them to canonical.

**Done when:** `git ls-files | grep -E "PROPOSED|PRE-RESCORE|__pycache__"` is empty.

---

## 7. Confirm the page transition actually fires

`page.tsx` intercepts artwork clicks via a document-level listener to drive `PageTransition`. React attaches its handlers at the root container, which is *inside* `document`, so Next's `Link` handler likely runs first and navigates before `preventDefault()` lands — meaning the transition may never play.

Observed via a programmatic `.click()`, which can order differently from a trusted user click, so this is **unconfirmed**. One real click settles it.

If it is dead: move the interception onto the `Link`'s own `onClick`, or use `capture: true` on the document listener.

**Done when:** a real click either plays the transition or is confirmed fixed.

---

## 8. Decide the lint/type strictness posture

Deliberately untouched this session because the blast radius is large and the call is yours.

- `eslint.config.mjs` disables ~30 rules including `no-undef`, `no-unreachable`, `no-unused-vars`, `no-fallthrough`, `@typescript-eslint/ban-ts-comment`, `react-hooks/exhaustive-deps`. The `--max-warnings=0` gate passes on code containing undefined identifiers and broken hook deps.
- `tsconfig.json` sets `noImplicitAny: false` directly under `strict: true`.

`ban-ts-comment` being off is the sharpest one — a stray `@ts-ignore` silently defeats the typecheck gate too.

Re-enable in stages, one rule per commit, fixing fallout as it appears. Do not flip them all at once.

**Done when:** each rule is either on, or off with a written reason.

---

## 9. Fix `.zscripts/start.sh`

`build.sh` was corrected this session to gate on `out/index.html`, but `start.sh` still looks for `./next-service-dist/server.js`, which `output: "export"` never produces. It exits 1 with `未启动任何 ARTCOVR 服务`.

The build now produces a tarball with no launcher that can serve it. `package.json` gained a working `preview` script (`scripts/serve-export.ts`, stdlib-only) — reuse that.

**Done when:** build → package → start works end-to-end on a clean checkout.

---

## 10. Bring in the new artwork variety

The sourcing work is done and waiting. From 357k files, only **322** are genuinely fresh and clear the square-1024 gate. A 60-work shortlist is selected by farthest-point traversal against the live catalog's own 512-d vectors:

```
E:\ART_COLLECTION\.artcovr-curation\diversify-2026-08-14-shortlist.json
E:\ART_COLLECTION\.artcovr-curation\diversify-2026-08-14-fresh-universe.json
E:\ART_COLLECTION\.artcovr-curation\diversify-2026-08-14-contact-0{1,2}.jpg
```

Palette spread: no single palette above 28%, against 73% concentrated in two palettes today.

Before intake:
- Cut the recognisable pastiches of specific famous paintings (Monet water lilies and Japanese bridge, Renoir boating party, Van Gogh postman). IP risk on a paid storefront regardless of taste.
- `concept_reference_art` adds no variety — it *is* the monotone teal/orange risograph style and contains near-duplicates. Prefer `new_meta_images`.
- Intake must run through the approval workbook. `swap-launch-works.ts` no longer auto-approves, so it will stop and demand it — that is intended.
- A swap rewrites display assets but does **not** invalidate `visual-index.json` / `visual-vectors.json`. Re-run `catalog:visual-index` after (now fixed to use `python` on Windows).

**Blocked by:** tasks 2 and 5. Do not add works while the catalog identity and rights posture are unresolved.

---

## Deliberately not on this list

- **Deleting `public/_headers` / `_redirects`** — inert on Vercel and publicly fetchable (they disclose the CSP and private-route list), but git history shows a Cloudflare Pages target where `_headers` *is* live. Confirm the deploy target before removing.
- **The duplicate `vercel.json`** — root and `public/` are byte-identical and a test now enforces that they cannot drift. Deduplicating is cosmetic.
- **CSP `script-src 'unsafe-inline'`** — structurally forced by `output: "export"` (no server, so no per-request nonce). The real fix is build-time SHA-256 hashes injected post-export. Cheap wins available now: `includeSubDomains` on HSTS, and a `report-uri`.
