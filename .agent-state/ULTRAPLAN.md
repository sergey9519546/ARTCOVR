# ULTRAPLAN — next 10 tasks

Written 2026-08-15. Ordered by risk: each task assumes the ones above it are done.

## Verified state at time of writing (updated 2026-08-16)

| Signal | Value |
|---|---|
| `bun run build` | exit 0 — `withheldUnapprovedRows:0`, `violations:0`, 2656 files scanned |
| `bun run test` | **145 / 145 pass, 0 fail** |
| `bun x tsc --noEmit` | clean |
| `bun run lint` | clean |
| HEAD | `0f7aec8` |
| Uncommitted | 0 files |

Everything below assumes that state. Re-run all four gates before starting if time has passed.

---

## 1. Commit the green state - do this first

**Status: DONE** (commits 7f0ac72, 176d7f6)

Two commits landed the e2e fixes and the duplicate-id cleanup:
- 7f0ac72 - e2e: staging broken-images guard + theme toggle assertion
- 176d7f6 - fix: eliminate duplicate id=theme-switcher (invalid HTML)

Working tree is clean; all four gates green on committed tree.

 — **CLOSED** ✅

Committed as `0f7aec8` (fix: capture green state — page-transition capture fix, nav/hero restyle, scroll audit). Working tree clean, all four gates green.

---

## 2. Reconcile the `launch-selection.ts` revert — **CLOSED** ✅ (ADR-015)

The rescore proposal was reverted and archived. ADR-015 documents the decision: the canonical `launch-selection.ts` drives the catalog; the rescore variant is archived under `catalog/swaps/_superseded/`. The three scratch variants are untracked (task 6).

---

## 3. Explain the 19 `generated_images` SHA mismatches — **CLOSED** ✅ (ADR-016)

ADR-016 documents the empirical resolution: the 19 `generated_images` rows use `sourceOrdinal` (not `sourceSha256`), and all 81 `sourceSha256`-bearing rows match `curated-artworks.json`. A regression test (`catalog-launch-identity.test.ts`) pins the XOR invariant.

---

## 4. Verify and, if needed, apply the Supabase migration live — **OPEN**

`supabase/migrations/202608140010_generation_rate_lanes.sql` applies cleanly and passes behavior checks on disposable PostgreSQL 16 through `bun run db:verify`. Its application to the live database is still unverified. Until live introspection proves otherwise, conservatively assume `request_generation` is still the earlier single-bucket version where free traffic can deny generation to paying customers.

- Apply against staging first; confirm the function replaced cleanly.
- Verify a purchased call succeeds while the free lane is saturated.
- Decide the throughput question: worst case rises 4/min → 8/min (4 free + 4 purchased). If the provider tier cannot absorb 8/min, lower the `>= 4` in the purchased branch — one number, lanes are independent.
- ~~Update `.agent-state/PRODUCT_CONTRACT.md:18` and `FAILURE_GRAPH.md:36`, both of which still document "4/min globally".~~ **This instruction is stale (corrected 2026-08-31.)** Both files were already rewritten to the dual-lane form, so they now assert behaviour this task says is not applied — the inverse of the problem described here. Both now carry an explicit UNVERIFIED marker, as does `supabase/README.md`, which still documents the single-lane bound. On applying the migration, the work is to *remove those markers*, not to update the numbers. If the migration is instead found already applied, remove the markers and correct `supabase/README.md` to the dual-lane form.

**Done when:** the live function body is inspected, the migration is applied there if absent, and a purchased call is verified while the free lane is saturated.

**Current status (2026-09-04):** Commit `957b064` records a PostgreSQL 16.13 G8 run in which all 12 migrations applied, 36 contract assertions held, and 5 behavioral checks passed. This host no longer has `psql`, so the 2026-09-04 gate run could not repeat that proof and correctly records G8 as **NOT RUN**. No live database credentials or verified migration ledger are available here, so the live body remains unknown; do not infer it from the migration file or the deployed function list.

---

## 5. Resolve the rights contradiction - owner decision, not a code fix

**Status: DONE** (ADR-018, 2026-08-15)

Owner confirmed all 100 candidates are genuinely approved.
Stale commercial_rights_unconfirmed / owner_approval_required flags stripped from approved-artworks.json (60 rows).
approval-import-report.json updated to approved: 100 / rejectedOrPending: 0 / blockers: [].
Regression test in tests/unit/catalog-curation.test.ts pins the invariant.

 — **CLOSED** ✅ (ADR-018)

ADR-018 stripped the stale `commercial_rights_unconfirmed` / `owner_approval_required` flags from all 60 rows in `approved-artworks.json`. The approval report now reads `approved: 100 / rejectedOrPending: 0 / launchCountValid: true`. A regression test (`catalog-curation.test.ts`) pins the decision.

---

## 6. Untrack the scratch files

**Status: DONE**

No tracked scratch files remain:
- git ls-files | grep -E PROPOSED|PRE-RESCORE|__pycache__ returns empty
- The files listed in the original task are not present on disk
- Workspace temp scripts from this session have been removed

 — **CLOSED** ✅

`git ls-files | grep -E "PROPOSED|PRE-RESCORE|__pycache__"` returns empty. The three scratch variants and the `__pycache__` file are untracked.

---

## 7. Confirm the page transition actually fires

**Status: DONE**

src/app/page.tsx:105 already uses capture-phase listener:
  document.addEventListener(click, handleArtworkClick, true);
The comment explicitly references ULTRAPLAN task 7 and explains the capture-phase rationale.
No further code change needed.

 — **CLOSED** ✅

Fixed in `0f7aec8`: `page.tsx` now registers the artwork-click listener with `capture:true`, so it runs **before** React/Next's `<Link>` onClick. `event.preventDefault()` wins, `PageTransition` plays instead of immediate navigation.

---

## 8. Lint/type strictness posture — **PARTIALLY COMPLETE** (design decision, staged)

Blast radius is large; changes are applied one rule at a time with fallout fixed before proceeding.

Completed:
- `@typescript-eslint/no-unused-vars` enabled (commit `4d7c228`). Configured with `varsIgnorePattern: "^_"` and `argsIgnorePattern: "^_"` so unused diagnostic variables prefixed with `_` do not fail lint. `no-unused-vars` (base JS rule) intentionally remains `off` because it flags generic TypeScript type parameters (`t`, `o`, `progress`) that are part of interface contracts but never read in implementation bodies.
- Dead diagnostic variables removed: `dismiss` in `Preloader.tsx`, `track`/`sec` in `scripts/diag-*.mjs`, `sourcePool` in `catalog-curation.test.ts`.

Remaining deferred rules (written reasons preserved):
- **`no-unreachable`** — low blast radius but not yet exercised; defer to avoid churn while the catalog + pricing work is still landing.
- **`no-fallthrough`** — low blast radius; defer for the same reason.
- **`react-hooks/exhaustive-deps`** — moderate blast radius. Enable in a dedicated follow-up commit and fix missing deps; the verify suite will catch regressions.
- **`@typescript-eslint/ban-ts-comment`** — high blast radius. Requires a sweep for `@ts-ignore`/`@ts-expect-error`. Keep off until a dedicated pass can add missing type declarations or justify each suppression.
- **`no-undef`** (base JS) — high blast radius. The build uses ambient globals (`gsap`/`ScrollTrigger`/`Bun`) that are not in `@types/*`. Keep off until ambient declarations are added.
- **`tsconfig.noImplicitAny: false`** under `strict: true` — defer to last, after all explicit types are in place.

**Done when:** the six items above are either enabled and green, or off with a written reason recorded here.

**Status (2026-08-27):** Four of the five deferred rules are now enabled and lint-clean:
- `no-unreachable: error` ✅ (was already on)
- `no-fallthrough: error` ✅ (was already on)
- `react-hooks/exhaustive-deps: error` ✅ (was already on)
- `@typescript-eslint/ban-ts-comment: error` ✅ (enabled 2026-08-27 — zero `@ts-ignore`/`@ts-expect-error` in codebase)

One rule remains deferred with written reason:
- **`no-undef`** — 5 false positives from TypeScript ambient globals (`Bun`, `React` JSX, `RequestInit`). ESLint lacks awareness of TypeScript's global type context without an explicit `globals` config. Fix requires adding `globals: { Bun: true }` and configuring `languageOptions.globals` for browser DOM types. Keep off until a dedicated pass adds that config cleanly.

---

## 9. Fix `.zscripts/start.sh` — **CLOSED** ✅

Already fixed before this session: `start.sh` serves `./next-service-dist/public` via Bun (static export), no `next-service-dist/server.js` dependency. `package.json` `preview` script (`scripts/serve-export.ts`) works end-to-end.

---

## 10. Bring in the new artwork variety — **CLOSED** ✅ (intake landed; 2026-08-25 verification)

**The intake happened.** The catalog grew from the 100-work launch set to **217 approved rows / 187 published works** — 117 works appended at approved positions 101–217. Verified by sha256 set arithmetic on 2026-08-25 (see ADR-023 for the full artifact invariant):

| Evidence | Result |
|---|---|
| `diversify-2026-08-14-shortlist.json` entries | 60 |
| shortlist sha256 present in `approved-artworks.json` | **53 / 60** |
| of those, in the 117 post-launch expansion | **53 / 53** (0 in the launch 100 — the shortlist is genuinely new material) |
| shortlist works at approved positions 180–217 | **38** — exactly the ADR-021 owner-delegated batch |
| shortlist works at approved positions 101–179 | 15 (117, 118, 120, 121, 123, 131, 137, 138, 139, 146, 160, 161, 164, 167, 168) |
| shortlist entries never approved | 7 — 0-based ranks **{7, 25, 30, 34, 35, 46, 52}** |

That unused set is a **verbatim match** for ADR-021's record: the owner rejected candidates 007, 025, 030, 034, 035 and 046, and 052 was independently excluded as a near-exact duplicate of the published `orange-door-encounter`. ADR-021's candidate numbering is therefore the 0-based `rank` field in `diversify-2026-08-14-shortlist.json`. The shortlist was consumed exactly as planned, with no silent substitutions.

**The shortlist is not the whole story.** It accounts for 53 of the 117 new works; the remaining **64** came from other pools in the same curation tree (sha256 hits in `diversify-2026-08-14-fresh-universe.json` ×32, `concept-square1024-audit.json` ×9, `codex-generated-batches/inventory.json` ×7, `final-100/final-100-id-title-map.json` ×6, `meta_sources/*` ×5, and others). New-work source pools: `generated_images` 41, `concept_reference_art` 35, `new_meta_images` 23, `regenerated_originals` 5, `modern_surrealism` 4, plus singles. Note the pre-intake advice below to prefer `new_meta_images` over `concept_reference_art` was **not** followed — 35 of the 117 are `concept_reference_art`; whether that reintroduced the teal/orange monotone is a visual-diversity question that `catalog:visual-index` can answer and this task did not.

Remaining follow-ups (not blockers on this task):
- The IP-pastiche cut listed below was never recorded as executed — confirm none of the 117 is a recognisable pastiche of a specific famous painting.
- Re-run `bun run catalog:visual-index` if palette spread over the 187 works has not been re-measured since the expansion.

Original plan text, retained as history:

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

~~**Blocked by:** owner source tree + service-role creds. Tasks 2 and 5 (launch-selection canonicalization and rights reconciliation) are now CLOSED, so the catalog identity and rights posture are stable. The remaining blocker is the owner-directed artwork selection from the 322-file fresh universe and the 60-work shortlist.~~ — resolved: the owner made the selection (ADR-021), 53 of the 60 shortlist works are approved, and the catalog is at 187 published works.

---

## Deliberately not on this list

- **Deleting `public/_headers` / `_redirects`** — inert on Vercel and publicly fetchable (they disclose the CSP and private-route list), but git history shows a Cloudflare Pages target where `_headers` *is* live. Confirm the deploy target before removing.
- **The duplicate `vercel.json`** — root and `public/` are byte-identical and a test now enforces that they cannot drift. Deduplicating is cosmetic.
- **CSP `script-src 'unsafe-inline'`** — structurally forced by `output: "export"` (no server, so no per-request nonce). The real fix is build-time SHA-256 hashes injected post-export. Cheap wins available now: `includeSubDomains` on HSTS, and a `report-uri`.
