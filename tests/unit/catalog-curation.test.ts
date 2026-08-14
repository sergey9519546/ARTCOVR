import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LAUNCH_SOURCE_POOLS,
  buildSearchText,
  containsLegacyBranding,
  launchSelection,
  normalizeStyleProfile,
} from "../../src/lib/artcovr/launch-selection.ts";
import {
  EXCLUDED_LAUNCH_SOURCE_HASHES,
  LAUNCH_REVIEW_SIZE,
  RETIRED_GENERATED_SOURCE_ORDINALS,
} from "../../src/lib/artcovr/catalog-review.ts";
import {
  REGENERATION_REQUIRED_SOURCES,
  REGENERATION_REQUIRED_SOURCE_HASHES,
} from "../../src/lib/artcovr/source-exclusions.ts";

test("launch selection contains exactly 100 surviving unique visual-review slots", () => {
  assert.equal(launchSelection.length, LAUNCH_REVIEW_SIZE);
  const identities = launchSelection.map(({ sourcePool, sourceOrdinal, sourceSha256 }) =>
    `${sourcePool}:${sourceOrdinal ?? sourceSha256}`,
  );
  assert.equal(new Set(identities).size, LAUNCH_REVIEW_SIZE);
  assert.ok(launchSelection.every(({ moodTags }) => moodTags.length >= 3));
  assert.ok(
    launchSelection.every(({ sourceOrdinal, sourceSha256 }) =>
      Boolean(sourceOrdinal) !== Boolean(sourceSha256),
    ),
  );
  assert.ok(
    launchSelection.every(
      ({ sourcePool, sourceOrdinal }) =>
        sourcePool !== "generated_images" ||
        sourceOrdinal === undefined ||
        !RETIRED_GENERATED_SOURCE_ORDINALS.has(sourceOrdinal),
    ),
  );
  assert.ok(
    launchSelection.every(
      ({ sourceSha256 }) =>
        sourceSha256 === undefined || !REGENERATION_REQUIRED_SOURCE_HASHES.has(sourceSha256),
    ),
  );
  assert.ok(
    launchSelection.every(
      ({ sourceSha256 }) =>
        sourceSha256 === undefined || !EXCLUDED_LAUNCH_SOURCE_HASHES.has(sourceSha256),
    ),
  );
});

test("every launch selection uses an owner-approved source pool", () => {
  const allowed = new Set(LAUNCH_SOURCE_POOLS);
  assert.deepEqual(
    [...allowed].sort(),
    [
      "concept_reference_art",
      "generated_images",
      "meta_updated_images",
      "new_download_root",
      "new_meta_images",
      "regenerated_originals",
    ],
  );
  assert.ok(launchSelection.every(({ sourcePool }) => allowed.has(sourcePool)));
});

test("regenerated originals are SHA-locked new works, never reused reference identities", async () => {
  const curated = JSON.parse(
    await readFile(new URL("../../catalog/curated-artworks.json", import.meta.url), "utf8"),
  ) as Array<{
    slug: string;
    sourcePool: string;
    sourceOrdinal: number | null;
    sourcePrompt: string | null;
    sha256: string;
    reviewFlags: string[];
    metadata: {
      keywords: string[];
      avoids: string[];
      palette: string[];
      lighting: string;
      lineworkAndEdges: string;
      mediumAndTexture: string;
      compositionAndMotion: string;
      provenance: {
        promptStatus: string;
        linkage: { reference_series?: string; keyword_source?: string; taxonomy_version?: string };
      };
    };
  }>;

  const regenerated = curated.filter(({ sourcePool }) => sourcePool === "regenerated_originals");
  const selected = launchSelection.filter(({ sourcePool }) => sourcePool === "regenerated_originals");
  assert.equal(regenerated.length, 8);
  assert.equal(selected.length, regenerated.length);
  assert.deepEqual(
    regenerated.map(({ sha256 }) => sha256).sort(),
    selected.map(({ sourceSha256 }) => sourceSha256).sort(),
  );

  // Owner-directed curator visual review (2026-08-14) enriched these 8 rows
  // with artcovr.cover-taxonomy.v1 controlled terms: catalog/swaps/2026-08-14-regenerated-metadata-enrichment.json.
  const BANNED_KEYWORD_TERMS = [
    "masterpiece",
    "best quality",
    "award winning",
    "trending",
    "viral",
    "4k",
    "8k",
    "ultra hd",
    "ai art",
    "ai-generated",
    "prompt",
  ];
  const TAXONOMY_FACET_TERM = /^[a-z_]+:[a-z0-9_]+$/;

  for (const record of regenerated) {
    // A regenerated original is a NEW file: it may never carry an excluded,
    // retired, or regeneration-only source identity.
    assert.ok(!EXCLUDED_LAUNCH_SOURCE_HASHES.has(record.sha256));
    assert.ok(!REGENERATION_REQUIRED_SOURCE_HASHES.has(record.sha256));
    assert.equal(record.sourceOrdinal, null);
    assert.ok(record.reviewFlags.includes("regenerated_original_reference_led"));
    // No trustworthy source prompt exists, so it stays explicitly empty
    // instead of being invented (catalog/README.md).
    assert.equal(record.sourcePrompt, null);
    assert.deepEqual(record.metadata.avoids, []);
    assert.equal(record.metadata.provenance.promptStatus, "unavailable; not reconstructed");
    assert.ok(
      ["gothic_surrealism", "modern_surrealism"].includes(
        record.metadata.provenance.linkage.reference_series ?? "",
      ),
    );

    // Owner-directed taxonomy-controlled enrichment: curator visual review of
    // the exact SHA-locked image, expressed in artcovr.cover-taxonomy.v1
    // controlled terms. Visual confidence only, never rights confidence.
    assert.ok(
      record.metadata.palette.length >= 3,
      `${record.slug}: expected an enriched palette of at least 3 entries`,
    );
    assert.ok(record.metadata.lighting.trim().length > 0, `${record.slug}: expected non-empty lighting`);
    assert.ok(
      record.metadata.mediumAndTexture.trim().length > 0,
      `${record.slug}: expected non-empty mediumAndTexture`,
    );
    assert.ok(
      record.metadata.lineworkAndEdges.trim().length > 0,
      `${record.slug}: expected non-empty lineworkAndEdges`,
    );
    assert.ok(
      record.metadata.compositionAndMotion.trim().length > 0,
      `${record.slug}: expected non-empty compositionAndMotion`,
    );
    assert.ok(
      record.metadata.keywords.length >= 10 && record.metadata.keywords.length <= 19,
      `${record.slug}: expected 10-19 keywords, got ${record.metadata.keywords.length}`,
    );
    assert.ok(
      record.metadata.keywords.some((keyword) => TAXONOMY_FACET_TERM.test(keyword)),
      `${record.slug}: expected at least one canonical facet:term taxonomy keyword`,
    );
    for (const keyword of record.metadata.keywords) {
      const normalized = keyword.toLowerCase();
      assert.ok(
        !BANNED_KEYWORD_TERMS.some((banned) => normalized.includes(banned)),
        `${record.slug}: keyword "${keyword}" matches a governance-banned term`,
      );
    }
    assert.equal(
      record.metadata.provenance.linkage.keyword_source,
      "curator visual review of the exact SHA-locked image + artcovr.cover-taxonomy.v1 controlled terms (visual confidence only, never rights confidence)",
    );
    assert.equal(record.metadata.provenance.linkage.taxonomy_version, "artcovr.cover-taxonomy.v1");
  }
});

test("thinned style-cluster works are removed from source and kept as audit records", async () => {
  const removed = [
    "city-reflection-bowl",
    "ramen-orbit",
    "tempest-teacup",
    "nesting-appliance",
    "luminous-ethereal-haze",
    "luminous-ethereal-pastel",
    "weather-under-the-umbrella",
    "suitcase-forecast",
  ];
  const [curated, excluded] = await Promise.all([
    readFile(new URL("../../catalog/curated-artworks.json", import.meta.url), "utf8"),
    readFile(new URL("../../catalog/excluded-candidates.json", import.meta.url), "utf8"),
  ]);
  const audited = (JSON.parse(excluded) as Array<{ slug: string; reason: string }>).filter(
    ({ reason }) => reason === "style_cluster_thinning_owner_directive_2026-08-14",
  );
  assert.deepEqual(audited.map(({ slug }) => slug).sort(), [...removed].sort());
  for (const slug of removed) {
    assert.ok(!curated.includes(`"${slug}"`), `${slug} is still in the launch catalog`);
  }
});

test("Q101 identities stay regeneration-only and cannot be reused", () => {
  assert.deepEqual(
    REGENERATION_REQUIRED_SOURCES.map(({ sourceSha256 }) => sourceSha256).sort(),
    [
      "08cbcad2e4cdfc9f3e87dd1f776b52aca164b0ff561df21f3c2d2add04b8fd02",
      "f8cd8331c771055b29a2080178c501157741689f8e18578706f08ada7f895471",
    ],
  );
});

test("manual visible-text rejects cannot return to launch review", () => {
  assert.ok(EXCLUDED_LAUNCH_SOURCE_HASHES.has(
    "16f9318705b3968c0457a5845822fdf02ba1c604d30defe3ed0095e65681cf9c",
  ));
});

test("normalizes the legacy schema without preserving prohibited branding", () => {
  const result = normalizeStyleProfile({
    $schema: "urn:legacy-name:schemas:art-style-profile:3.0.0",
    identity: { style_id: "example" },
  });
  assert.equal(result.$schema, "urn:artcovr:schemas:art-style-profile:3.0.0");
  assert.equal(containsLegacyBranding(result), false);
});

test("rejects prohibited branding outside the replaceable schema field", () => {
  const prohibitedSourceLabel = [83, 69, 82, 71, 69, 89, 32, 47, 32, 69, 68, 73, 84, 73, 79, 78, 83]
    .map((code) => String.fromCharCode(code))
    .join("");
  assert.throws(
    () => normalizeStyleProfile({ $schema: "legacy", note: prohibitedSourceLabel }),
    /legacy brand reference/i,
  );
});

test("builds deterministic search text from connected metadata", () => {
  assert.equal(
    buildSearchText({
      title: "Cloud Study",
      description: "A stairway through clouds.",
      category: "Surreal",
      moodTags: ["ethereal"],
      keywords: ["cloudscape"],
      palette: ["lavender"],
      lighting: "soft backlight",
      mediumAndTexture: "film grain",
    }),
    "Cloud Study | A stairway through clouds. | Surreal | ethereal | cloudscape | lavender | soft backlight | film grain",
  );
});

test("the duplicated curated-artworks catalog and supabase seed stay byte-identical", async () => {
  const catalogPath = new URL("../../catalog/curated-artworks.json", import.meta.url);
  const seedPath = new URL(
    "../../supabase/seed/artworks.curated.metadata.json",
    import.meta.url,
  );
  const [catalogBytes, seedBytes] = await Promise.all([
    readFile(catalogPath),
    readFile(seedPath),
  ]);
  const catalogHash = createHash("sha256").update(catalogBytes).digest("hex");
  const seedHash = createHash("sha256").update(seedBytes).digest("hex");
  assert.equal(
    catalogHash,
    seedHash,
    "catalog/curated-artworks.json and supabase/seed/artworks.curated.metadata.json have diverged",
  );
});
