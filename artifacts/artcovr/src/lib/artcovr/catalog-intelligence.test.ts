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
  INTELLIGENCE_METADATA_CHUNK_FILES,
  INTELLIGENCE_PAYLOAD_CONTRACT,
  intersectCatalogFacetSlugs,
  summarizeCatalogIntelligence,
} from "./catalog-intelligence.ts";
import { validateCatalogIntelligencePayload } from "./catalog-payload.ts";
import { visualIndex } from "./visual-index.ts";

describe("catalog intelligence", () => {
  test("builds one approved intelligence record per public artwork", () => {
    const index = buildCatalogFacetIndex(artworks);
    assert.equal(CATALOG_INTELLIGENCE_VERSION, "artcovr-catalog-intelligence-v1");
    assert.equal(index.records.size, artworks.length);

    for (const artwork of artworks) {
      const record = getCatalogIntelligenceRecord(artwork);
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

  test("recognizes all individual metadata chunks as the complete metadata family", () => {
    const readiness = getExternalPayloadReadiness([
      ...INTELLIGENCE_METADATA_CHUNK_FILES,
      ...Object.values(INTELLIGENCE_PAYLOAD_CONTRACT).filter(
        (payload) => payload !== INTELLIGENCE_PAYLOAD_CONTRACT.metadataChunks,
      ),
    ]);
    assert.equal(readiness.mode, "external-payload-ready");
    assert.equal(readiness.families.metadata, "available");
    assert.deepEqual(readiness.missing, []);
  });

  test("rejects stale, orphaned, dimension-mismatched, and unapproved payload records", () => {
    const catalog = [
      {
        slug: "approved-work",
        image: "/assets/artworks/approved-work.jpg",
        rightsApproved: true,
        published: true,
      },
      {
        slug: "staging-work",
        image: "/private/staging-work.jpg",
        rightsApproved: false,
        published: false,
      },
    ];
    const result = validateCatalogIntelligencePayload({
      catalog,
      payload: {
        metadata: [{ slug: "approved-work", filename: "old-name.jpg" }],
        fasttextPredictions: { "unknown.jpg": {} },
        fasttextIndex: { style: { Graphic: ["unknown.jpg"] } },
        fasttextStats: {},
        fasttextAnalysis: {},
        search: { slugs: ["approved-work"] },
        vectors: { slugs: ["approved-work"], dimensions: 768 },
        related: { "approved-work.jpg": { related: ["unknown.jpg"] } },
        approvedPublic: [{ slug: "staging-work", filename: "staging-work.jpg" }],
        duplicates: {
          groups: [{ canonical: "approved-work.jpg", members: ["other.jpg"] }],
        },
      },
      options: { expectedCorpusSize: 2 },
    });

    assert.equal(result.ok, false);
    assert.equal(result.completeness, "incomplete");
    assert.equal(result.integrity, "invalid");
    assert.ok(result.issues.some(({ code }) => code === "STALE_RECORD"));
    assert.ok(result.issues.some(({ code }) => code === "ORPHAN_PAYLOAD"));
    assert.ok(result.issues.some(({ code }) => code === "DIMENSION_MISMATCH"));
    assert.ok(result.issues.some(({ code }) => code === "RELATED_ORPHAN"));
    assert.ok(result.issues.some(({ code }) => code === "UNAPPROVED_PUBLIC"));
    assert.equal(result.reports.fasttextIndex.status, "invalid");
    assert.equal(result.reports.vectors.status, "invalid");
    assert.equal(result.reports.vectors.completeness, "incomplete");
    assert.equal(result.reports.vectors.integrity, "invalid");
    assert.equal(result.reports.duplicates.status, "invalid");
  });
});