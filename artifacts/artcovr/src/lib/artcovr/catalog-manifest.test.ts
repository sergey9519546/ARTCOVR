import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildCatalogIntelligenceManifest,
  getCatalogManifestPayloadPaths,
  serializeCatalogIntelligenceManifest,
  validateCatalogIntelligenceBundle,
  verifyCatalogIntelligenceManifest,
} from "./catalog-manifest.ts";

const catalog = [
  { slug: "first-work", image: "/assets/first-work.jpg" },
  { slug: "second-work", image: "/assets/second-work.jpg" },
];

const files = getCatalogManifestPayloadPaths().map((path) => ({
  path,
  content: `payload:${path}`,
}));

describe("catalog intelligence manifest", () => {
  test("records stable identity coverage, dimensions, and every payload hash", () => {
    const manifest = buildCatalogIntelligenceManifest({
      catalog,
      files,
      sourceVersion: "catalog-source@2026-09-01",
      expectedCorpusSize: 2,
    });

    assert.equal(manifest.corpus.count, 2);
    assert.equal(manifest.corpus.identityCoverage.slugCount, 2);
    assert.equal(manifest.corpus.identityCoverage.filenameCount, 2);
    assert.equal(manifest.vector.dimensions, 512);
    assert.equal(manifest.payloads.length, files.length);
    assert.ok(manifest.payloads.every(({ sha256, bytes }) => sha256.length === 64 && bytes > 0));
    assert.match(serializeCatalogIntelligenceManifest(manifest), /"identitySource"/);
  });

  test("rejects stale source, changed payloads, and substituted files", () => {
    const manifest = buildCatalogIntelligenceManifest({
      catalog,
      files,
      sourceVersion: "catalog-source@2026-09-01",
      expectedCorpusSize: 2,
    });
    const changedFiles = files.map((file, index) =>
      index === 0 ? { ...file, content: "substituted payload" } : file,
    );
    const result = verifyCatalogIntelligenceManifest({
      manifest,
      catalog: [{ ...catalog[0], image: "/assets/renamed.jpg" }, catalog[1]],
      files: [...changedFiles, { path: "unexpected.js", content: "unexpected" }],
      sourceVersion: "catalog-source@new",
    });

    assert.equal(result.ok, false);
    assert.ok(result.issues.some(({ code }) => code === "MANIFEST_SOURCE_MISMATCH"));
    assert.ok(result.issues.some(({ code }) => code === "MANIFEST_IDENTITY_MISMATCH"));
    assert.ok(result.issues.some(({ code }) => code === "MANIFEST_HASH_MISMATCH"));
    assert.ok(result.issues.some(({ code }) => code === "MANIFEST_FILE_UNEXPECTED"));
  });

  test("combines decoded payload validation with the manifest gate", () => {
    const manifest = buildCatalogIntelligenceManifest({
      catalog,
      files,
      sourceVersion: "catalog-source@2026-09-01",
      expectedCorpusSize: 2,
    });
    const payload = {
      metadata: catalog.map(({ slug, image }) => ({ slug, filename: image })),
      fasttextPredictions: {
        "first-work.jpg": {},
        "second-work.jpg": {},
      },
      fasttextIndex: {},
      fasttextStats: { style: {} },
      fasttextAnalysis: {
        "first-work.jpg": {},
        "second-work.jpg": {},
      },
      search: { slugs: catalog.map(({ slug }) => slug) },
      vectors: { slugs: catalog.map(({ slug }) => slug), dimensions: 512 },
      related: {
        "first-work.jpg": { related: ["second-work.jpg"] },
        "second-work.jpg": { related: [] },
      },
      duplicates: { groups: [] },
    };
    const result = validateCatalogIntelligenceBundle({
      catalog,
      payload,
      manifest,
      manifestFiles: files,
      sourceVersion: "catalog-source@wrong",
      options: { expectedCorpusSize: 2 },
    });

    assert.equal(result.ok, false);
    assert.equal(result.manifestVerification.ok, false);
    assert.ok(result.issues.some(({ code }) => code === "MANIFEST_MISMATCH"));
  });
});