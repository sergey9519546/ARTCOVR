import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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

test("the asset directory serves the public catalog; surviving review works keep their derivatives", async () => {
  // Since the 2026-08-15 tier split, public/assets/artworks holds exactly the
  // projected public catalog: launch works the owner marked delete lose their
  // derivative, and post-launch additions gain one. The review set is a
  // historical artifact, so it is checked as an intersection, not an equality.
  const artworkDirectory = new URL("../../public/assets/artworks/", import.meta.url);
  const actualFiles = new Set(
    (await readdir(artworkDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name),
  );
  const publicRows = JSON.parse(
    await readFile(new URL("../../src/lib/artcovr/curated-public.json", import.meta.url), "utf8"),
  ) as Array<{ slug: string }>;

  for (const { slug } of publicRows) {
    assert.ok(actualFiles.has(`${slug}.jpg`), `missing display derivative for public work ${slug}`);
  }

  const publicSlugs = new Set(publicRows.map(({ slug }) => slug));
  for (const candidate of curatedCandidates) {
    const file = path.posix.basename(candidate.displayPath);
    const slug = file.replace(/\.jpg$/, "");
    if (publicSlugs.has(slug)) {
      assert.ok(actualFiles.has(file), `surviving review work ${slug} lost its derivative`);
    }
  }
});
