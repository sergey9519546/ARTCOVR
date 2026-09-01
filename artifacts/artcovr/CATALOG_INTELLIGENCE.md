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
A future import must validate identity coverage, approval isolation, vector
dimensions, related-link targets, duplicate canonicality, and keyword/index
alignment before the data can be used.

## Safe uses

Public discovery may use approved visual labels, palette/color descriptors,
genres, normalized keywords, and derived related works. Authenticated owner
tools may later use duplicate review, aggregate distribution charts, and a
precomputed visual map. Private prompts, local paths, unapproved records, raw
vectors, and the full 22,260-image corpus must stay outside public bundles.