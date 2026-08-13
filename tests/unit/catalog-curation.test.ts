import assert from "node:assert/strict";
import test from "node:test";

import {
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
