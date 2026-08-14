import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  displayArtworks,
  getArtworkBySlug,
  getCheckoutTotal,
  isCheckoutReady,
  isPromptReady,
  pickIntroArtworks,
  searchArtworks,
  stagingArtworks,
} from "./artworks.ts";

describe("artwork helpers", () => {
  test("keeps owner-review artwork in the private staging catalog", () => {
    assert.equal(stagingArtworks.length, 100);
    const reviewArtwork = stagingArtworks[0];
    assert.ok(reviewArtwork);
    assert.equal(getArtworkBySlug(reviewArtwork.slug)?.slug, reviewArtwork.slug);
  });

  test("falls back to the review catalog when no approved public catalog exists yet", () => {
    assert.ok(displayArtworks.length > 0);
    assert.equal(displayArtworks[0]?.slug, stagingArtworks[0]?.slug);
  });

  test("picks a diverse intro-art set with category spread", () => {
    const introArtworks = pickIntroArtworks(displayArtworks, 6);
    assert.equal(introArtworks.length, 6);
    const uniqueCategories = new Set(introArtworks.map((artwork) => artwork.category));
    assert.ok(uniqueCategories.size >= 4);
  });

  test("searches artwork metadata across categories, moods, and descriptors", () => {
    const match = searchArtworks("cyan enigmatic collage", displayArtworks);
    assert.ok(match.some((artwork) => artwork.slug === "cyan-passage"));

    const exactMatch = searchArtworks("cart-of-hours", displayArtworks);
    assert.ok(exactMatch.some((artwork) => artwork.slug === "cart-of-hours"));
  });

  test("returns undefined for an unknown artwork", () => {
    assert.equal(getArtworkBySlug("missing-work"), undefined);
  });

  test("formats a checkout total from cents", () => {
    assert.equal(getCheckoutTotal(null), "Pricing pending owner approval");
  });

  test("requires meaningful prompt direction", () => {
    assert.equal(isPromptReady("  add a nocturnal city horizon  "), true);
    assert.equal(isPromptReady("   "), false);
  });

  test("blocks checkout for unapproved owner art", () => {
    const artwork = stagingArtworks[0];
    assert.ok(artwork);
    assert.equal(isCheckoutReady(artwork), false);
  });
});
