# ARTCOVR catalog intelligence

ARTCOVR keeps commerce and discovery as separate concerns. Rights approval,
publication, price, and sale mode come from the approved catalog projection.
Visual descriptors, genres, colors, moods, keywords, and similarity are
discovery signals only and cannot publish or sell a work.

## Stable join

The canonical join is the artwork slug. The display asset filename is retained
as `assetKey` for import audits and is never used as an approval signal. Every
public intelligence record must resolve to exactly one approved catalog row.

## Current public projection

The public site uses the compact checked-in artifacts:

- `visual-index.json` for audited labels, confidence, diversity order, and
  related-work scores.
- `search-index.json` for quantized phrase-to-work semantic ranking.
- Editorial catalog fields, mood tags, and deterministic music genres for
  lexical discovery.

Raw 512-dimensional vectors remain an audit/regeneration input. They are not
imported by storefront code because doing so would add a large payload without
providing a customer-visible benefit.

## External viewer payload contract

The attached viewers reference these payload families:

- `chunks/metadata_0000.js` through `chunks/metadata_0022.js`
- `fasttext_predictions.js`
- `fasttext_index.js`
- `fasttext_stats.js`
- `fasttext_analysis.js`
- `search_index.js`
- `embeddings.js`
- `similar.js`
- `duplicates.js`

The HTML files do not contain those payloads. The application reports the
payload set as incomplete instead of silently treating missing data as empty.

## Import and integrity boundary

`src/lib/artcovr/catalog-payload.ts` is the import boundary for a decoded
bundle. `validateCatalogIntelligencePayload` requires the full
`FULL_CATALOG_SIZE` (22,260) by default and validates each layer before use:

- metadata, FastText predictions, analysis, search, vectors, and related
  neighbors must cover every catalog identity exactly once;
- FastText indexes must point only at known filenames;
- vectors must declare 512 dimensions;
- related targets must resolve to known slugs/filenames;
- duplicate groups must include one canonical member and cannot reuse members;
- stale slug/filename joins, orphan records, missing records, and an
  unapproved `approvedPublic` projection produce explicit issues.

Each family reports `missing`, `incomplete`, `invalid`, or `valid` status.
`integrity: "valid"` and `completeness: "complete"` are both required before
the bundle is trusted. A smaller fixture or intentionally scoped staging
import must opt into an explicit `expectedCorpusSize`.

The validator returns `projection.approvedPublic` and
`projection.privateStaging` as separate identity lists. The public list is
identity-only and contains no raw vectors, prompts, local paths, or private
metadata. The full bundle is not imported by storefront code; the checked-in
public artifacts remain the bounded customer-facing source.

## Regeneration manifest

When the external bundle is regenerated, create and verify a manifest before
an owner-side import. The command reads the bundle as bytes; it does not
import JavaScript payloads or copy the full corpus into the storefront:

```sh
pnpm --filter @workspace/artcovr run catalog-intelligence:manifest -- \
  generate \
  --bundle-dir /path/to/external-bundle \
  --catalog-file /path/to/catalog-identities.json \
  --source-version catalog-export@SOURCE_REVISION \
  --out /path/to/catalog-intelligence-manifest.json

pnpm --filter @workspace/artcovr run catalog-intelligence:manifest -- \
  verify \
  --bundle-dir /path/to/external-bundle \
  --catalog-file /path/to/catalog-identities.json \
  --source-version catalog-export@SOURCE_REVISION \
  --manifest /path/to/catalog-intelligence-manifest.json
```

After a manifest has been generated, a single owner-side import command can
decode every JavaScript payload family, validate the decoded bundle, and write
the result. The command reads and hashes the raw files before parsing any
payload data. It accepts only declarative object/array literal assignments and
never executes the external JavaScript; calls, functions, operators, property
access, and additional statements are rejected. It does not write its output
when manifest or payload validation fails:

```sh
pnpm --filter @workspace/artcovr run catalog-intelligence:import -- \
  --bundle-dir /path/to/external-bundle \
  --catalog-file /path/to/catalog-identities.json \
  --source-version catalog-export@SOURCE_REVISION \
  --manifest /path/to/catalog-intelligence-manifest.json \
  --out /path/to/owner-import/catalog-intelligence.json
```

The importer defaults to the full 22,260-record corpus and the fixed
512-dimensional vector contract. `--expected-corpus-size N` is available only
for an explicitly scoped fixture or staging run; pass the same value to the
`generate` command above and to the import command, and every family must
still validate against that corpus. The importer intentionally has no
override for vector dimensions because the catalog payload contract is fixed
at 512.

`catalog-identities.json` is the source catalog array containing `slug` and
one of `assetKey`, `filename`, `displayPath`, or `image`. The manifest records
the source revision, the stable slug/filename identity source, corpus count,
slug and filename coverage, a canonical identity hash, the 512-dimensional
vector contract, and SHA-256 plus byte counts for every metadata chunk,
FastText output, search index, vector, related-neighbor, and duplicate-group
file. Verification fails on stale identity data, a changed source revision,
missing or extra files, substituted files, and hash/byte mismatches.

Keep the manifest, raw external bundle, and import output in the owner-side
import workspace; do not check them into the storefront bundle. The
owner-side library entry point is `importCatalogIntelligenceBundle` in
`src/lib/artcovr/catalog-manifest.ts`: supply the manifest, the raw
`manifestFiles`, the catalog source revision, and a `decodePayload` callback.
It verifies the raw file hashes first and only then decodes and validates the
payload. A changed, substituted, missing, or unexpected file returns the
specific manifest issue and an empty projection; it must not be partially
imported. Callers that already decoded a payload may use
`validateCatalogIntelligenceBundle`, which applies the same manifest-first
short-circuit. Both entry points keep the raw bundle and manifest outside the
storefront artifact.

## Safe uses

Public discovery may use approved visual labels, palette/color descriptors,
genres, normalized keywords, and derived related works. Authenticated owner
tools may later use duplicate review, aggregate distribution charts, and a
precomputed visual map. Private prompts, local paths, unapproved records, raw
vectors, and the full 22,260-image corpus must stay outside public bundles.