import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import curatedCandidates from "../../catalog/curated-artworks.json" with { type: "json" };
import curatedReview from "../../src/lib/artcovr/curated-review.json" with { type: "json" };
import {
  LAUNCH_REVIEW_SIZE,
  validateLaunchReviewIntegrity,
} from "../../src/lib/artcovr/catalog-review.ts";
import { launchSelection } from "../../src/lib/artcovr/launch-selection.ts";

test("the 100-art review catalog has exact ordered identity, metadata, and publication-gate parity", () => {
  assert.deepEqual(
    validateLaunchReviewIntegrity({
      candidates: curatedCandidates,
      review: curatedReview,
      selection: launchSelection,
    }),
    [],
  );
  assert.equal(curatedCandidates.length, LAUNCH_REVIEW_SIZE);
  assert.equal(curatedReview.length, LAUNCH_REVIEW_SIZE);
});

test("the review asset directory contains exactly the 100 selected display derivatives", async () => {
  const artworkDirectory = new URL("../../public/assets/artworks/", import.meta.url);
  const actualFiles = (await readdir(artworkDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const expectedFiles = curatedCandidates
    .map(({ displayPath }) => path.posix.basename(displayPath))
    .sort();

  assert.equal(actualFiles.length, LAUNCH_REVIEW_SIZE);
  assert.deepEqual(actualFiles, expectedFiles);
});
