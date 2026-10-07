import assert from "node:assert/strict";
import test from "node:test";

import { featuredArtworks } from "./artworks";
import {
  homepageArtworkGroups,
  MAX_SPIRAL_ARTWORKS,
  partitionHomepageArtworks,
} from "./homepage-artwork-groups";

test("the current featured catalog is split 33/29/30 without repeated covers", () => {
  const { grid, slide, spiral } = homepageArtworkGroups;
  const allGroups = [...grid, ...slide, ...spiral];

  assert.deepEqual([grid.length, slide.length, spiral.length], [33, 29, 30]);
  assert.equal(grid.length - 12 - 5, 16);
  assert.equal(allGroups.length, featuredArtworks.length);
  assert.deepEqual(
    new Set(allGroups.map(({ id }) => id)),
    new Set(featuredArtworks.map(({ id }) => id)),
  );

  for (const key of ["id", "slug", "image"] as const) {
    const values = allGroups.map((artwork) => artwork[key]);
    assert.equal(
      new Set(values).size,
      values.length,
      `homepage artwork groups must not repeat ${key}`,
    );
  }
});

test("catalog-size-aware partitions are deterministic, complete, and bounded", () => {
  for (let total = 0; total <= 250; total += 1) {
    const artworks = Array.from({ length: total }, (_, index) => ({
      id: `id-${index}`,
      slug: `slug-${index}`,
      image: `/cover-${index}.jpg`,
    }));
    const groups = partitionHomepageArtworks(artworks);
    const assigned = [...groups.grid, ...groups.slide, ...groups.spiral];

    assert.deepEqual(partitionHomepageArtworks(artworks), groups);
    assert.equal(assigned.length, total);
    assert.deepEqual(
      new Set(assigned.map(({ id }) => id)),
      new Set(artworks.map(({ id }) => id)),
    );
    assert.ok(groups.spiral.length <= MAX_SPIRAL_ARTWORKS);

    if (total < 3) {
      assert.equal(groups.grid.length, total);
      assert.equal(groups.slide.length + groups.spiral.length, 0);
    } else {
      assert.ok(groups.grid.length > 0);
      assert.ok(groups.slide.length > 0);
      assert.ok(groups.spiral.length > 0);
    }
  }
});
