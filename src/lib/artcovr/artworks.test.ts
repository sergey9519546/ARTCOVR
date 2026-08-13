import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  getArtworkBySlug,
  getCheckoutTotal,
  isCheckoutReady,
  isPromptReady,
  stagingArtworks,
} from "./artworks.ts";

describe("artwork helpers", () => {
  test("keeps owner-review artwork in the private staging catalog", () => {
    assert.equal(stagingArtworks.length, 100);
    const reviewArtwork = stagingArtworks[0];
    assert.ok(reviewArtwork);
    assert.equal(getArtworkBySlug(reviewArtwork.slug), undefined);
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
