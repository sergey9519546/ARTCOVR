# ARTCOVR catalog approval

This directory is a non-destructive import staging area. Nothing here publishes an artwork by itself.

## Source and review flow

1. The technical audits read only the five owner-approved direct-use pools: `generated_images`, `NEW META IMAGES`, `meta_ai_generated_images_since_may11_UPDATED_full/images`, the root of `NEW DOWNLOAD_COLLECTION_FULL`, and square files from `concept_reference_art`.
2. Each candidate is magic-byte checked, decoded, dimension-gated, SHA-256 hashed, cross-pool deduplicated, visually reviewed, and linked only to trustworthy source metadata.
3. `scripts/catalog/curate-launch.ts` maintains an exact 100-art launch-review set. Only surviving, technically valid, owner-selected sources enter it; deleted or unreadable sources are never restored or padded back into the catalog. `generated_images` selections join 1:1 to their rich style profiles; external records preserve curator metadata and explicit confidence instead of inventing missing prompts.
   The raw local source-path map is written outside the storefront to `ARTCOVR_PRIVATE_ROOT` (default `E:\ART_COLLECTION\.artcovr-private`); only path-free SHA-256 and source-pool provenance enters catalog/backend payloads.
4. `scripts/catalog/Prepare-DisplayAssets.ps1` fully decodes only those 100 selections and creates lightweight raster-marked review derivatives. Clean sources remain outside the public site and are never copied to `public`.
5. `npm run catalog:approval:build` creates the owner workbook in `outputs/catalog/ARTCOVR_Catalog_Approval.xlsx`. Workbook commands intentionally use the bundled Codex spreadsheet runtime and fail with a clear prerequisite message when that runtime is unavailable; no storefront dependency is added.
6. The owner fills every yellow launch field: title, description, category, mood, price, sale mode, rights approval, publication, and decision.
7. `npm run catalog:approval:import -- [workbook] [--launch]` recomputes launch gates and rejects source-field tampering. Column R is source-pool provenance and column S is the private object key; local source paths never enter the workbook. The importer never trusts the displayed `READY` formula, and a failed or empty import cannot replace the last approved artifact.
8. Only validated, non-empty `approved-artworks.json` rows may be published. `npm run catalog:project` deterministically projects those rows into the static storefront file; `npm run catalog:project:check` proves that the committed projection is synchronized. The separate `curated-review.json` file is private-staging review data, never a public publication source.
9. `npm run catalog:storage:plan` verifies the exact local source SHA, bytes, MIME type, and dimensions plus the display derivative, then writes an ignored private upload plan. A live apply requires `--apply=<exact plan SHA-256>` and service-role credentials; existing mismatched objects are never overwritten, and every uploaded object is downloaded and re-hashed.
10. `npm run catalog:supabase:dry-run` validates the approved artifact, proves its SHA/catalog-ID mapping, and prints deterministic artifact hashes without writing or connecting to Supabase. After reviewing that result, `npm run catalog:supabase:write` writes offline SQL and an audit manifest under `supabase/seed/`; it still never connects to a project or executes SQL. Metadata re-imports preserve an artwork already delisted by an exclusive sale or operator.
11. `npm run catalog:launch:check` is the explicit 100–200 approved-publication gate. The review contract independently requires exactly 100 selected candidates, connected metadata rows, review projections, and display derivatives.
12. Catalog removal is explicit, not inferred from an omitted spreadsheet row. Add a SHA-bound, owner-reviewed record to `catalog/revoked-artworks.json`, run `npm run catalog:revocations:dry-run`, then generate offline SQL with `catalog:revocations:write`. The operation only sets `is_listed=false`; it never deletes purchases or artwork history.

## Important gates

- `exclusive` and `repeatable` are the only sale modes.
- Rights approval is an explicit owner decision; technical validity is not proof of commercial rights.
- `maybe_images`, taxonomy hardlinks, WebP derivatives, corrupt/zero files, undersized sources, and duplicates are outside this candidate set.
- `outputs/catalog/review-assets` and `outputs/catalog/thumbnails` are owner-review artifacts, not deployable clean originals.
- `public/assets/artworks` contains exactly the 100 small review/display derivatives required by private prototype review. A production publication must be projected only from the owner-approved artifact; nonselected candidates have no derived image copy in the project.
- Every selected record retains SHA-256, dimensions, byte-detected MIME type, source pool, linked keywords, and metadata confidence. Prompt, avoids, palette, lighting, texture, and composition remain explicit null/empty values whenever no trustworthy source exists.
- No numeric embedding existed in the source data. Supabase derives a real PostgreSQL `tsvector` from the connected catalog text. A future semantic embedding must use a separately approved, versioned model and must never be fabricated.
- All source collections remain unchanged by these scripts.

## Regeneration-only reference pools

`IMAGES_GOTHIC_SURREALISM` and `IMAGES_ MODERN SURREALISM` are inspiration-only. Their current files never enter this direct-use catalog or public assets. Selected references are linked to original regeneration briefs by a private reference ID; only newly generated, re-hashed, reviewed, and owner-approved outputs can become artworks.
