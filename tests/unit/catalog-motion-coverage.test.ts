import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import curatedReview from "../../src/lib/artcovr/curated-review.json" with { type: "json" };
import { LAUNCH_REVIEW_SIZE } from "../../src/lib/artcovr/catalog-review.ts";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("the home product grid renders every artwork after the supplied editorial layouts", async () => {
  const [grid, card] = await Promise.all([
    read("src/components/parity/ProductGrid.tsx"),
    read("src/components/parity/ProductCard.tsx"),
  ]);
  assert.match(grid, /displayArtworks\.slice\(13\)/);
  assert.match(grid, /remainingArtworks\.map/);
  assert.match(grid, /<ProductCard key=\{artwork\.id\} artwork=\{artwork\}/);
  assert.match(card, /href=\{`\/product\/\$\{artwork\.slug\}`\}/);
  assert.equal(curatedReview.length, LAUNCH_REVIEW_SIZE);
});

test("all 100 review identities have unique product destinations consumed by the three gallery surfaces", async () => {
  const [grid, card, carousel, spiral] = await Promise.all([
    read("src/components/parity/ProductGrid.tsx"),
    read("src/components/parity/ProductCard.tsx"),
    read("src/components/parity/TiltedCarousel.tsx"),
    read("src/components/parity/SpiralScroll.tsx"),
  ]);
  const productDestinations = curatedReview.map(({ slug }) => `/product/${slug}`);

  assert.equal(productDestinations.length, LAUNCH_REVIEW_SIZE);
  assert.equal(new Set(productDestinations).size, LAUNCH_REVIEW_SIZE);
  assert.match(grid, /displayArtworks\.slice\(13\)/);
  assert.match(card, /href=\{`\/product\/\$\{artwork\.slug\}`\}/);
  assert.match(carousel, /displayArtworks\.map/);
  assert.match(carousel, /href=\{`\/product\/\$\{item\.slug\}`\}/);
  assert.match(spiral, /index \* displayArtworks\.length/);
  assert.match(spiral, /% displayArtworks\.length/);
  assert.match(spiral, /href=\{`\/product\/\$\{artwork\.slug\}`\}/);
});

test("the horizontal archive maps the full catalog to product links", async () => {
  const carousel = await read("src/components/parity/TiltedCarousel.tsx");
  assert.match(carousel, /displayArtworks\.map/);
  assert.match(carousel, /ITEMS\.map/);
  assert.match(carousel, /href=\{`\/product\/\$\{item\.slug\}`\}/);
  assert.match(carousel, /ITEMS\.length \* SCROLL_PIXELS_PER_CARD/);
});

test("the spiral samples the full launch catalog and product-links every rendered artwork", async () => {
  const spiral = await read("src/components/parity/SpiralScroll.tsx");
  assert.match(spiral, /MAX_SPIRAL_ITEMS = 40/);
  assert.match(spiral, /Math\.floor\([\s\S]*index \* displayArtworks\.length[\s\S]*MAX_SPIRAL_ITEMS/);
  assert.match(spiral, /const staticItems = displayArtworks/);
  assert.match(spiral, /ITEMS\.map/);
  assert.match(spiral, /href=\{`\/product\/\$\{artwork\.slug\}`\}/);
  assert.match(spiral, /Math\.floor\([\s\S]*index \* displayArtworks\.length[\s\S]*MAX_SPIRAL_ITEMS/);
  assert.match(spiral, /const staticItems = displayArtworks/);
});
