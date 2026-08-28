import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import curatedReview from "../../src/lib/artcovr/curated-review.json" with { type: "json" };
import { featuredArtworks } from "../../src/lib/artcovr/artworks.ts";
import {
  JOURNEY_SPIRAL_SPAN,
  journeyPhases,
  makeJourneyConsts,
  SHARED_HANDOFF_SWITCH,
} from "../../src/components/parity/journey.ts";

const read = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("the home product grid renders every artwork after the supplied editorial layouts", async () => {
  const [grid, card, runway] = await Promise.all([
    read("src/components/parity/ProductGrid.tsx"),
    read("src/components/parity/ProductCard.tsx"),
    read("src/components/parity/GridRunway.tsx"),
  ]);
  assert.match(grid, /displayArtworks\.slice\(GRID_RUNWAY_END\)/);
  assert.match(grid, /<GridRunway \/>/);
  assert.match(runway, /data-artwork-runway/);
  assert.match(runway, /featuredArtworks\.slice\(12, GRID_RUNWAY_END\)/);
  assert.match(runway, /<ProductCard/);
  assert.match(runway, /scrub: 0\.8/);
  assert.match(runway, /ease: "none"/);
  assert.match(runway, /overflow-x-auto/);
  assert.match(runway, /data-\[runway-motion=true\]:overflow-hidden/);
  assert.match(grid, /remainingArtworks\.map/);
  assert.match(grid, /<ProductCard key=\{artwork\.id\} artwork=\{artwork\}/);
  assert.match(card, /href=\{`\/product\/\$\{artwork\.slug\}`\}/);
  const renderedSequence = [
    ...featuredArtworks.slice(0, 12),
    ...featuredArtworks.slice(12, 17),
    ...featuredArtworks.slice(17),
  ].map(({ slug }) => slug);
  assert.deepEqual(renderedSequence, featuredArtworks.map(({ slug }) => slug));
  assert.equal(new Set(renderedSequence).size, featuredArtworks.length);
});

test("all review identities have unique product destinations consumed by the three gallery surfaces", async () => {
  const [grid, card, runway, carousel, spiral] = await Promise.all([
    read("src/components/parity/ProductGrid.tsx"),
    read("src/components/parity/ProductCard.tsx"),
    read("src/components/parity/GridRunway.tsx"),
    read("src/components/parity/TiltedCarousel.tsx"),
    read("src/components/parity/SpiralScroll.tsx"),
  ]);
  const productDestinations = curatedReview.map(({ slug }) => `/product/${slug}`);

  assert.equal(productDestinations.length, curatedReview.length);
  assert.equal(new Set(productDestinations).size, curatedReview.length);
  assert.match(grid, /displayArtworks\.slice\(GRID_RUNWAY_END\)/);
  assert.match(runway, /featuredArtworks\.slice\(12, GRID_RUNWAY_END\)/);
  assert.match(card, /href=\{`\/product\/\$\{artwork\.slug\}`\}/);
  assert.match(carousel, /displayArtworks\.map/);
  assert.match(carousel, /href=\{`\/product\/\$\{item\.slug\}`\}/);
  assert.match(spiral, /index \* displayArtworks\.length/);
  assert.match(spiral, /% displayArtworks\.length/);
  assert.match(spiral, /href=\{`\/product\/\$\{artwork\.slug\}`\}/);
});

test("the spiral gives each sampled cover a readable scroll runway", () => {
  const journey = makeJourneyConsts(40);
  assert.equal(JOURNEY_SPIRAL_SPAN, 12_000);
  assert.equal(journey.spiralSpan, 12_000);
  assert.equal(journey.total, journey.carouselSpan + 12_000);
  assert.ok(
    Math.abs(
      journeyPhases(journey.carouselEndP, journey).handoff -
        SHARED_HANDOFF_SWITCH,
    ) < Number.EPSILON * 4,
  );
});

test("the final carousel cover is the spiral's shared lead", async () => {
  const [carousel, spiral] = await Promise.all([
    read("src/components/parity/TiltedCarousel.tsx"),
    read("src/components/parity/SpiralScroll.tsx"),
  ]);
  assert.match(carousel, /ph\.handoff >= SHARED_HANDOFF_SWITCH/);
  assert.match(spiral, /const terminal = displayArtworks\[displayArtworks\.length - 1\]/);
  assert.match(spiral, /spiralOwnsLead = ph\.handoff >= SHARED_HANDOFF_SWITCH/);
  assert.doesNotMatch(carousel, /converge\.style\.opacity = String\(ph\.carouselOpacity\)/);
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
