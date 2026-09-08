# Customer experience and discovery — 2026-09-07

Implementation branch: `codex/customer-experience-20260907`. The active product remains the pnpm React/Vite storefront, Express API and PostgreSQL/Drizzle workspace, delivered through GitHub to Replit.

## Customer-facing changes

- Archive discovery exposes all 20 supported music lanes, mood and color controls, search, recommended/diverse/title sorting, and display density. Genre matches distinguish existing metadata rules from additional visual-neighbor support. These are suggestions about a cover's visual fit; no audio was analyzed or classified.
- A visual crate saves approved artwork choices in this browser. It survives navigation and browser back/forward. Saving does not reserve artwork, establish ownership, lock a price, or create a purchase.
- Product pages and archive trails offer three distinct ways to explore: **Image connections**, **Shared palette**, and **Shared mood**. Results explain their basis. Trail selection is reflected in navigation/history, and moving to another product starts that product's own trail.
- Editor drafts retain prompt, cover text and style within the tab. Changing artwork cannot carry another cover's generated result or reference photo into the new editor. Selecting the original purchased image preserves the composed edit; Reset clears the edit and photo. Upload cancellation ignores late responses, failed uploads can retry the same file, and suggestions respect the prompt length limit.
- Customer downloads refresh authorization and obtain a current matching asset link before downloading. Revocation, expired access and unavailable files produce explicit errors; old links are not reused as a fallback. The account response identifies unavailable downloads without exposing private storage paths.
- The archive rail begins at its section's left edge. Track travel, counters, focus calculations and the scaled spiral handoff use that same alignment. Static navigation remains available with reduced motion, including arrow-key movement.

## What powers discovery

`artifacts/artcovr/src/lib/artcovr/semantic-search.ts` uses the existing, precomputed CLIP phrase-to-artwork search matrix: 743 phrase rows across 187 approved works. It combines that signal with lexical search; it does not compute new embeddings or call a model in the browser.

`discovery-index.ts` separately uses the existing pixel-descriptor index. Image connections preserve its six recorded nearest neighbors where those works remain inside the approved scope. Palette and mood exploration return broader shared-trait matches, not additional nearest-vector neighbors. Genre expansion uses one-hop positive descriptor-neighbor support from direct metadata matches; it does not propagate classifications through multiple hops. Direct metadata matches rank first.

The inspected local CLIP lab is `E:/ART_COLLECTION/.artcovr-curation/semantic-lab/`, including `embed_images.py`, `clip_common.py`, `rank.py`, `catalog-clip.npy` and `catalog-clip-manifest.json`. The manifest covers the 187 catalog slugs and 512-dimensional vectors, but does not establish per-image SHA correspondence, a vector-file digest or a pinned model revision. This work therefore makes no claim of a newly verified local CLIP recomputation. The broader approximately 22,000-image corpus was excluded because its approved-catalog hash correspondence and lineage were not established.

The existing builders remain inspectable at `.migration-backup/scripts/search/build-search-index.ts` and `.migration-backup/scripts/catalog/build-visual-index.ts`. Their location is historical; the retired Bun/Next implementation is not the active application. No raw source vectors or private masters were added to public assets by this change.

## Verification and limits

An integration run of `pnpm run verify:ci` completed with exit code 0 under Node 24 against fresh disposable local PostgreSQL. The production build used the existing public production Clerk key. Final verification totals and the final commit are reported by the root task after the remaining regression additions; earlier totals are not presented as final results here.

The in-app browser exercised the actual discovery components in an isolated harness. Observed results included IDM expanding from 4 direct matches to 21 supported suggestions, persistent crate selection, a sample trail moving from 6 image connections to 42 palette matches and 21 mood matches, back navigation restoring the crate, and no horizontal overflow at 390px. Initial rail geometry measured image-left = section-left: 28px at the inspected 1069px layout and 16px in the inspected mobile layout.

That component harness isolates authentication; it is not a complete authenticated customer journey. The production Clerk key fails local-IP authentication, and no real Clerk test-tenant key was available. Full Playwright E2E therefore remains **blocked/unrun**, including live sign-in, payment and fulfillment integration. The isolated harness is not a substitute for that gate. Replit deployment of this candidate has not been verified.

## Repository handoff

The work began from `main` at `39596a23d1a5ff94ee6ab0fc025566e47e3de5dd`. At the inspected fetch, the separate credits branch `origin/codex/replit-credits-20260905` was at `2129db8`; its history is preserved. Final remote status must come from the root task's synchronization checks. No force-push or history discard is part of this work.

A later fetch confirmed `origin/main` was unchanged, while another process switched the shared checkout back to `main`. The root task's handoff plan is to snapshot only its owned files through an isolated Git index into the feature branch and push that branch, without switching this shared checkout or disturbing its current index. The root task reports whether that snapshot and push completed.

The unrelated `.migration-backup/scripts/catalog/analyze-archive-expansion.py` appeared during implementation and is excluded from this change. Earlier GitHub Actions evidence reports an account billing lock; that does not establish a Replit deployment failure. Replit deployment remains the release route, and a successful local build does not prove publication or live commerce readiness.
