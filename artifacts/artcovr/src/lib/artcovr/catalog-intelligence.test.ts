import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  artworks,
  getArtworkBySlug,
} from "./artworks.ts";
import {
  buildCatalogFacetIndex,
  CATALOG_INTELLIGENCE_VERSION,
  getCatalogIntelligenceRecord,
  getExternalPayloadReadiness,
  INTELLIGENCE_PAYLOAD_CONTRACT,
  intersectCatalogFacetSlugs,
  summarizeCatalogIntelligence,
} from "./catalog-intelligence.ts";
import { visualIndex } from "./visual-index.ts";

describe("catalog intelligence", () => {
  test("builds one approved intelligence record per public artwork", () => {
    const index = buildCatalogFacetIndex(artworks);
    assert.equal(CATALOG_INTELLIGENCE_VERSION, "artcovr-catalog-intelligence-v1");
    assert.equal(index.records.size, artworks.length);

    for (const artwork of artworks) {
      const record = index.records.get(artwork.slug);
      assert.ok(record, `${artwork.slug}: intelligence record is missing`);
      assert.equal(record.source, "approved-public");
      assert.equal(record.assetKey, artwork.image.split("/").pop());
      assert.equal(record.genreLabels.length, record.genres.length);
      assert.ok(record.genreLabels.every((label) => label.length > 0));
      assert.equal(record.vector.dimensions, visualIndex.dimensions);
      assert.ok(record.keywords.length > 0, `${artwork.slug}: no discovery keywords`);
    }
  });

  test("intersects indexed facets without changing the catalog identity set", () => {
    const index = buildCatalogFacetIndex(artworks);
    const first = artworks[0];
    assert.ok(first);
    const record = getCatalogIntelligenceRecord(first);
    const matching = intersectCatalogFacetSlugs(index, {
      genre: record.genres[0],
      color: record.colors[0],
    });

    assert.ok(matching);
    assert.ok(matching.has(first.slug));
    for (const slug of matching) {
      const artwork = getArtworkBySlug(slug);
      assert.ok(artwork);
      const candidate = index.records.get(slug);
      assert.ok(candidate);
      assert.ok(candidate.genres.includes(record.genres[0]));
      assert.ok(candidate.colors.includes(record.colors[0]));
    }
  });

  test("produces aggregate summaries without exposing raw vectors", () => {
    const summary = summarizeCatalogIntelligence(buildCatalogFacetIndex(artworks));
    assert.equal(summary.totalWorks, artworks.length);
    assert.equal(summary.indexedWorks, artworks.length);
    assert.equal(summary.visualDimensions, visualIndex.dimensions);
    assert.ok(summary.relatedEdges >= artworks.length);
    assert.ok(summary.facets.genre.length > 0);
    assert.ok(summary.facets.color.length > 0);
    assert.ok(summary.facets.mood.length > 0);
    assert.ok(summary.facets.style.length > 0);
    assert.equal("vectors" in summary, false);
  });

  test("reports missing external viewer payloads explicitly", () => {
    const readiness = getExternalPayloadReadiness();
    assert.equal(readiness.mode, "native-approved-projection");
    assert.ok(readiness.missing.includes(INTELLIGENCE_PAYLOAD_CONTRACT.embeddings));
    assert.ok(readiness.missing.includes(INTELLIGENCE_PAYLOAD_CONTRACT.duplicates));
    assert.match(readiness.message, /incomplete/i);
  });

  test("recognizes a complete external payload contract", () => {
    const readiness = getExternalPayloadReadiness(Object.values(INTELLIGENCE_PAYLOAD_CONTRACT));
    assert.equal(readiness.mode, "external-payload-ready");
    assert.deepEqual(readiness.missing, []);
  });
});