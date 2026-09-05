import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";

import {
  featuredArtworks,
  pickIntroArtworks,
} from "../../src/lib/artcovr/artworks.ts";
import {
  PRELOADER_COMPLETE_TIME_MS,
  PRELOADER_FAILSAFE_TIME_MS,
} from "../../src/lib/artcovr/motion.ts";

test("the desktop intro has a bounded transfer and interaction budget", async () => {
  const covers = pickIntroArtworks(featuredArtworks, 6);
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const sizes = await Promise.all(covers.map(async (artwork) =>
    (await stat(join(root, "public", artwork.image.replace(/^\//, "")))).size));

  assert.equal(covers.length, 6);
  assert.ok(new Set(covers.map(({ category }) => category)).size >= 5);
  assert.ok(sizes.reduce((total, size) => total + size, 0) <= 2.5 * 1024 * 1024);
  assert.ok(PRELOADER_COMPLETE_TIME_MS <= 2_100);
  assert.ok(PRELOADER_FAILSAFE_TIME_MS <= 3_000);
});
