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

test("every launch-selection sourceSha256 resolves to a curated catalog sha256 (canonical identity invariant, ADR-016)", async () => {
  const curated = JSON.parse(
    await readFile(new URL("../../catalog/curated-artworks.json", import.meta.url), "utf8"),
  ) as Array<{ sha256: string; sourcePool: string; sourceOrdinal: number | null }>;
  const curatedSha = new Set(curated.map(({ sha256 }) => sha256));
  assert.equal(curated.length, 100);

  // XOR invariant (re-affirmed): every entry has exactly one of sourceOrdinal/sourceSha256.
  assert.ok(
    launchSelection.every(({ sourceOrdinal, sourceSha256 }) =>
      Boolean(sourceOrdinal) !== Boolean(sourceSha256),
    ),
    "expected XOR invariant: every launchSelection entry has exactly one of sourceOrdinal/sourceSha256",
  );

  // The generated_images pool identifies its source by ordinal into a manifest,
  // not by hash (curate-launch.ts:344-346 resolves via normalizeGenerated(sourceOrdinal),
  // not metaByHash.get(...)). Reaffirm that none of the 19 generated_images entries
  // carry a sourceSha256 — they must all use sourceOrdinal.
  const genImg = launchSelection.filter(({ sourcePool }) => sourcePool === "generated_images");
  assert.equal(genImg.length, 19);
  for (const entry of genImg) {
    assert.equal(
      typeof entry.sourceOrdinal,
      "number",
      `generated_images entry must use sourceOrdinal, got sourceSha256=${entry.sourceSha256}`,
    );
    assert.equal(entry.sourceSha256, undefined);
  }

  // ADR-010: catalog sha256 fields track source files, not display derivatives,
  // so a launch-selection.sourceSha256 (the source-file hash) must resolve to a
  // curated row whose sha256 equals it. A mismatch here would mean either the
  // catalog stores a derivative hash for that pool (benign, needs documenting)
  // OR 19 rows point at source files that are not what shipped (real identity
  // break in a rights-gated catalog). Empirically all 81 known sourceSha256
  // entries resolve; this test fails loudly if any future proposal breaks that.
  const withSha = launchSelection.filter(
    ({ sourceSha256 }) => sourceSha256 !== undefined,
  ) as Array<{ sourcePool: string; sourceSha256: string }>;
  assert.equal(withSha.length, 81, "expected exactly 81 sourceSha256-bearing entries");

  const byPool = withSha.reduce((counts, { sourcePool }) => {
    counts[sourcePool] = (counts[sourcePool] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  assert.deepEqual(byPool, {
    new_meta_images: 12,
    meta_updated_images: 1,
    concept_reference_art: 60,
    regenerated_originals: 8,
  });

  const unmatched = withSha.filter(({ sourceSha256 }) => !curatedSha.has(sourceSha256));
  assert.equal(
    unmatched.length,
    0,
    `expected every sourceSha256 to match a curated.sha256; unmatched: ${JSON.stringify(unmatched, null, 2)}`,
  );
});

test("the approved artifact has no stale rights-contradiction flags once the owner confirms approval (ADR-018)", async () => {
  // Two-stage model: curated-artworks.json is the pre-approval candidate set
  // (rightsApproved===false on every row, reviewFlags carry the legitimate candidate
  // notes "commercial_rights_unconfirmed" / "owner_approval_required"). approved-artworks.json
  // is the owner-approved artifact: rightsApproved===true on every row, so the same two
  // candidate notes there are STALE and contradicted the approval. ADR-018 strips them from
  // approved-artworks.json only -- this test pins the reconciled approved state so a future
  // swap or workbook re-import cannot silently re-stamp the contradiction.
  const STALE_FLAGS = new Set(["commercial_rights_unconfirmed", "owner_approval_required"]);
  const ALLOWED_REVIEW_FLAGS = new Set([
    "no_obvious_logo_text_watermark_likeness_or_protected_character_in_visual_review",
    "regenerated_original_reference_led",
    "generic-robot-form-review",
    // Provenance flags recorded during the 2026-08-15 catalog expansion. These
    // annotate visible in-image lettering, photographic collage elements or a
    // painted-canvas look for the owner's ongoing review; they do not contradict
    // the owner's explicit green approval of the works.
    "watermark_or_text",
    "identifiable_person",
    "possible_photo_of_physical_artwork",
  ]);

  const rows = JSON.parse(
    await readFile(new URL("../../catalog/approved-artworks.json", import.meta.url), "utf8"),
  ) as Array<{ id?: string; slug: string; rightsApproved?: boolean; reviewFlags?: string[] }>;

  assert.ok(
    rows.length >= LAUNCH_REVIEW_SIZE,
    "approved-artworks.json must hold at least the 100 launch rows (the catalog may grow past launch)",
  );

  for (const row of rows) {
    assert.equal(
      row.rightsApproved,
      true,
      `approved-artworks.json/${row.slug}: ADR-018 requires rightsApproved===true on every approved row`,
    );
  }

  // The stale candidate notes contradict approval and must not survive in the artifact.
  const offenders = rows.filter((row) =>
    (row.reviewFlags ?? []).some((flag) => STALE_FLAGS.has(flag)),
  );
  assert.equal(
    offenders.length,
    0,
    `approved-artworks.json: ${offenders.length} row(s) still carry a stale rights-contradiction flag (${[
      ...STALE_FLAGS,
    ].join(" / ")}). Re-running the 2026-08-14 swap or an unmodified workbook import would reintroduce the rights/approval contradiction cleared in ADR-018.`,
  );

  // Legitimacy guard: every surviving reviewFlag is a known clearance/provenance flag,
  // so an unexpected new flag cannot slip through this gate unnoticed.
  const unknown = new Set<string>();
  for (const row of rows) {
    for (const flag of row.reviewFlags ?? []) {
      if (!ALLOWED_REVIEW_FLAGS.has(flag)) unknown.add(flag);
    }
  }
  assert.equal(
    unknown.size,
    0,
    `approved-artworks.json: encountered reviewFlags outside the ADR-018 allowlist: ${[...unknown].join(", ")}`,
  );

  // The import report must agree with the reconciled approved artifact.
  const report = JSON.parse(
    await readFile(new URL("../../catalog/approval-import-report.json", import.meta.url), "utf8"),
  ) as {
    approved: number;
    rejectedOrPending: number;
    blockers: string[];
    launchCountValid: boolean;
  };

  assert.equal(report.approved, LAUNCH_REVIEW_SIZE, "report.approved must reflect the 100 confirmed rows");
  assert.equal(report.rejectedOrPending, 0);
  assert.equal(report.launchCountValid, true);
  assert.deepEqual(report.blockers, [], "EMPTY_APPROVAL_SET blocker must be cleared post ADR-018");
});

test("the approved catalog carries the owner-confirmed four-tier pricing distribution (ADR-019)", async () => {
  // ADR-019 supersedes ADR-017: the four-tier pricing structure is owner-approved.
  // The launch catalog grew from 100 -> 169 rows (commit 12bbcd9 added 69 works);
  // the four price tiers scale proportionally across the full 169-row set:
  //   $200 x17 exclusive, $80 x34 exclusive, $35 x51 repeatable, $10 x67 repeatable
  //   (51 exclusive / 118 repeatable). A display `tier` field (featured/archive/delete)
  // was introduced with the expansion: 92 featured, 47 archive, 30 delete.
  // This test pins the confirmed price-tier distribution AND the display tiers so a
  // future swap or re-import cannot silently change pricing or launch visibility
  // without an explicit decision.
  const rows = JSON.parse(
    await readFile(new URL("../../catalog/approved-artworks.json", import.meta.url), "utf8"),
  ) as Array<{
    id: string;
    slug: string;
    saleMode: string;
    priceCents: number;
    tier?: string;
    rightsApproved?: boolean;
  }>;

  // Every priced row must be rights-approved and carry an explicit display tier.
  for (const row of rows) {
    assert.equal(row.rightsApproved, true, `${row.slug}: ADR-018 + ADR-019 require rightsApproved===true`);
    assert.ok(
      row.tier === "featured" || row.tier === "archive" || row.tier === "delete",
      `${row.slug}: display tier must be featured|archive|delete, got ${String(row.tier)}`,
    );
  }

  const priceTiers = new Map<string, number>();
  const displayTiers = new Map<string, number>();
  for (const row of rows) {
    const priceKey = `${row.saleMode}|${row.priceCents}`;
    priceTiers.set(priceKey, (priceTiers.get(priceKey) ?? 0) + 1);
    if (row.tier) displayTiers.set(row.tier, (displayTiers.get(row.tier) ?? 0) + 1);
  }

  assert.equal(rows.length, 169, "approved-artworks.json: 169 rows (100 launch + 69 expansion)");
  assert.equal(priceTiers.get("exclusive|20000"), 17, "exclusive @ $20000 ($200): 17 rows");
  assert.equal(priceTiers.get("exclusive|8000"), 34, "exclusive @ $8000 ($80): 34 rows");
  assert.equal(priceTiers.get("repeatable|3500"), 51, "repeatable @ $3500 ($35): 51 rows");
  assert.equal(priceTiers.get("repeatable|1000"), 67, "repeatable @ $1000 ($10): 67 rows");
  assert.equal(priceTiers.size, 4, "exactly four price-tier combinations");

  assert.equal(
    rows.filter((r) => r.saleMode === "exclusive").length,
    51,
    "51 exclusive rows (17 + 34)",
  );
  assert.equal(
    rows.filter((r) => r.saleMode === "repeatable").length,
    118,
    "118 repeatable rows (51 + 67)",
  );

  // Per-work exclusivity snapshot (ADR-019): the redistribution silently
  // flipped 21 works from repeatable -> exclusive under a commit framed as
  // "pricing confirmation". The count assertions above only guard the 51/118
  // totals, so a future repricing could reassign WHICH works are one-of-a-kind
  // while preserving those totals. This sorted id set pins the exact exclusive
  // membership so any future reassignment requires an explicit, test-visible
  // update to this constant (the decision record for exclusivity changes).
  const EXCLUSIVE_IDS = [
    "art_03f778b0a48c953089da", "art_0e872f93a29287069ecd", "art_0f35c7c5c3ddc2eec9eb",
    "art_0fd601a7160d4f9facfd", "art_28045b4e171c65b43e14", "art_34484601883fc0dafcdf",
    "art_36ff0ac7ef6f1644c861", "art_38bbfbb3cd7d931b2271", "art_4a75bfcdf2490e7a4b83",
    "art_57e77b3c104fad05c99a", "art_5f394c1df8412dec9646", "art_6016a8ebb5d3f5a9f23d",
    "art_6300243b12de93e8b568", "art_6baed7162ea6572b2434", "art_6da3a7473dbfdf826e6c",
    "art_7042fab38aac05f1101f", "art_7665d24d25cbb3d2bb81", "art_77c70ed3ed2d410dbfd5",
    "art_78dbbe3b64a54b0969a9", "art_8a1b6f2d3f74c098f243", "art_8c950047fe3756a2a5a4",
    "art_8d7e7164e829ecdb2c96", "art_9401682d689b745117c1", "art_95b953c39ee6f78c922b",
    "art_9acb2bf21ff1f0f4a954", "art_9fc168e232a06e37ad41", "art_a0fb88023bd8b3f74b72",
    "art_a22e035c417e6e774d51", "art_a2de27b6021422e09b89", "art_a88d3b6f35817a318596",
    "art_a9db588e9d9142ad503e", "art_a9e192edb2e42460375f", "art_aa6471f478e9dbbb275a",
    "art_aa83f38d1426f968d7c2", "art_af133895ec864914fc62", "art_b3f4491ac7965631b3b1",
    "art_bd41353a5408921c7d58", "art_c70963dfd83c1b3cd4dc", "art_c73360b8f81c50b57ad0",
    "art_c757341870883fc1c55d", "art_d27b6457129241d3a6a6", "art_dfead6e9a75acb469725",
    "art_e114dbcce2588ae7f0b8", "art_f271bff03a4a8bf3660c", "art_f2835117b4c4ae98b6e2",
    "art_f602e6a079a278f92200", "art_f942e5b6d543fcd04fc0", "art_fd6312bbd6441c9e025a",
    "art_fd84809ef1554e0a7869", "art_fe5ff95ceff9c926a109", "art_fe656bad878235933f3e",
  ];
  assert.deepEqual(
    rows.filter((r) => r.saleMode === "exclusive").map((r) => r.id).sort(),
    [...EXCLUSIVE_IDS].sort(),
    "exclusive id set must match the ADR-019 snapshot — a future redistribution cannot silently flip a work's exclusivity (repeatable <-> exclusive) while preserving the 51/118 totals",
  );

  assert.equal(displayTiers.get("featured"), 92, "92 featured display rows");
  assert.equal(displayTiers.get("archive"), 47, "47 archive display rows");
  assert.equal(displayTiers.get("delete"), 30, "30 delete display rows");
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
