import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCatalogImport,
  canonicalJson,
  serializeCatalogImportManifest,
  sha256,
} from "../../src/lib/artcovr/catalog-import.ts";

const approvedArtwork = (seed: "a" | "b") => {
  const sha = seed.repeat(64);
  const title = seed === "a" ? "Copper Sky" : "Black Orchard";
  const slug = title.toLowerCase().replaceAll(" ", "-");
  return {
    id: `art_${sha.slice(0, 20)}`,
    slug,
    title,
    description: `${title} description tied to ${sha.slice(0, 8)}.`,
    alt: `${title} square cover artwork.`,
    category: seed === "a" ? "Surreal" : "Gothic",
    mood: seed === "a" ? "luminous, uncanny" : "nocturnal; ceremonial",
    width: 2048,
    height: 2048,
    bytes: seed === "a" ? 1_250_000 : 1_500_000,
    sha256: sha,
    sourceOrdinal: seed === "a" ? 7 : null,
    sourceMimeType: seed === "a" ? "image/png" : "image/jpeg",
    sourcePrompt: seed === "a" ? "A copper cloud above a black sea." : null,
    privateBasePath: `artworks/art_${sha.slice(0, 20)}/base`,
    displayPath: `/assets/artworks/${slug}.jpg`,
    validationStatus: "technical-pass",
    rightsApproved: true,
    published: true,
    priceCents: seed === "a" ? 12000 : 18000,
    currency: "USD",
    saleMode: seed === "a" ? "repeatable" : "exclusive",
    metadata: {
      styleId: seed === "a" ? "thermal-copper" : null,
      styleFamily: seed === "a" ? "Painterly" : "Surreal",
      keywords: seed === "a" ? ["copper", "cloud", "grain"] : ["orchard", "gothic", "moon"],
      avoids: ["wordmark", "frame"],
      palette: seed === "a" ? ["copper", "black"] : ["black", "bone"],
      lighting: "single-source glow",
      lineworkAndEdges: "soft grain with carved edges",
      mediumAndTexture: "screenprint and oil",
      compositionAndMotion: "centered subject with ascending motion",
      promptTemplates: { concept_preserving: `{subject}. ${title}.` },
      styleProfile: { identity: { name: title }, schema_version: "3.0.0" },
      provenance: { confidence: "source-linked" },
      searchVector: { status: "derived_on_database_import", type: "postgres_tsvector" },
    },
  } as const;
};

test("maps every approved row 1:1 by full source SHA and SHA-derived catalog id", () => {
  const source = [approvedArtwork("b"), approvedArtwork("a")];
  const build = buildCatalogImport(source);

  assert.deepEqual(build.issues, []);
  assert.equal(build.rows.length, source.length);
  assert.deepEqual(
    build.rows.map(({ catalogId }) => catalogId),
    [...source].map(({ id }) => id).sort(),
    "rows are emitted in a deterministic catalog-id order",
  );

  for (const input of source) {
    const row = build.rows.find(({ sourceSha256 }) => sourceSha256 === input.sha256);
    assert.ok(row, `missing row for ${input.sha256}`);
    assert.equal(row.catalogId, input.id);
    assert.equal(row.catalogId, `art_${row.sourceSha256.slice(0, 20)}`);
    assert.equal(row.title, input.title);
    assert.equal(row.description, input.description);
    assert.deepEqual(row.keywords, input.metadata.keywords);
    assert.equal(row.styleId, input.metadata.styleId);
    assert.equal(canonicalJson(row.styleMetadata), canonicalJson(input.metadata));
    assert.match(build.sql, new RegExp(input.id));
    assert.match(build.sql, new RegExp(input.sha256));
  }

  assert.deepEqual(
    build.manifest.rows.map(({ catalogId, sourceSha256 }) => ({ catalogId, sourceSha256 })),
    build.rows.map(({ catalogId, sourceSha256 }) => ({ catalogId, sourceSha256 })),
  );
  for (const manifestRow of build.manifest.rows) {
    const importRow = build.rows.find(({ catalogId }) => catalogId === manifestRow.catalogId);
    assert.ok(importRow);
    assert.equal(manifestRow.styleMetadataSha256, sha256(canonicalJson(importRow.styleMetadata)));
  }
});

test("is deterministic regardless of approved artifact row order", () => {
  const forward = buildCatalogImport([approvedArtwork("a"), approvedArtwork("b")]);
  const reverse = buildCatalogImport([approvedArtwork("b"), approvedArtwork("a")]);

  assert.equal(forward.sql, reverse.sql);
  assert.equal(
    serializeCatalogImportManifest(forward.manifest),
    serializeCatalogImportManifest(reverse.manifest),
  );
});

test("re-importing catalog metadata never relists an artwork removed by commerce", () => {
  const build = buildCatalogImport([approvedArtwork("a")]);

  assert.match(build.sql, /is_listed = current\.is_listed/);
  assert.doesNotMatch(build.sql, /is_listed = true/);
});

test("unapproved input emits zero SQL and zero seed rows", () => {
  const unapproved = {
    ...approvedArtwork("a"),
    rightsApproved: false,
    published: false,
  };
  const build = buildCatalogImport([unapproved]);

  assert.equal(build.rows.length, 0);
  assert.equal(build.manifest.rowCount, 0);
  assert.deepEqual(build.manifest.rows, []);
  assert.equal(build.sql, "");
  assert.ok(build.issues.some(({ code }) => code === "NOT_APPROVED"));
});

test("rejects a catalog id that does not derive from the same full source SHA", () => {
  const mismatched = { ...approvedArtwork("a"), id: `art_${"b".repeat(20)}` };
  const build = buildCatalogImport([mismatched]);

  assert.equal(build.rows.length, 0);
  assert.equal(build.sql, "");
  assert.ok(build.issues.some(({ code }) => code === "INVALID_IDENTITY"));
});

test("the real approved artifact is the only CLI input and maps without joins", async () => {
  const projectRoot = new URL("../../", import.meta.url);
  const source = JSON.parse(
    await readFile(new URL("catalog/approved-artworks.json", projectRoot), "utf8"),
  ) as unknown[];
  const cli = await readFile(
    new URL("scripts/catalog/build-supabase-import.ts", projectRoot),
    "utf8",
  );
  const build = buildCatalogImport(source);

  assert.match(cli, /APPROVED_CATALOG_SOURCE/);
  assert.doesNotMatch(cli, /curated-artworks|candidates\.json|createClient|SUPABASE_URL|fetch\(/);
  assert.deepEqual(build.issues, []);
  assert.equal(build.rows.length, source.length);
  assert.equal(new Set(build.rows.map(({ catalogId }) => catalogId)).size, build.rows.length);
  assert.equal(new Set(build.rows.map(({ sourceSha256 }) => sourceSha256)).size, build.rows.length);
});
