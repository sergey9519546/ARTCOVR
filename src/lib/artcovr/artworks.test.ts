import assert from "node:assert/strict";
import { describe, test } from "node:test";

import curatedReview from "./curated-review.json" with { type: "json" };
import {
  artworks,
  displayArtworks,
  featuredArtworks,
  getArtworkBySlug,
  getCheckoutTotal,
  isCheckoutReady,
  isPrivateStaging,
  isPromptReady,
  pickIntroArtworks,
  searchArtworks,
  stagingArtworks,
  type Artwork,
} from "./artworks.ts";
import { LAUNCH_REVIEW_SIZE } from "./catalog-review.ts";

const reviewCatalog = curatedReview as Artwork[];

describe("artwork helpers", () => {
  test("keeps review catalog in the private staging source", () => {
    assert.equal(reviewCatalog.length, LAUNCH_REVIEW_SIZE);
    const reviewArtwork = reviewCatalog[0];
    assert.ok(reviewArtwork);
  });

  test("staging catalog is empty outside the explicit staging flag", () => {
    if (!isPrivateStaging) {
      assert.equal(stagingArtworks.length, 0);
    }
  });

  test("returns undefined for an unknown artwork", () => {
    assert.equal(getArtworkBySlug("missing-work"), undefined);
  });

  test("never leaks staging works into the public catalog: only approved rows are public", () => {
    for (const artwork of artworks) {
      assert.equal(artwork.rightsApproved, true);
      assert.equal(artwork.published, true);
    }
    // With zero approved works, the public catalog must be empty rather than
    // falling back to the unapproved staging review set.
    if (artworks.length === 0 && !isPrivateStaging) {
      assert.equal(displayArtworks.length, 0);
    }
  });

  test("displayArtworks only exposes staging works under the explicit staging flag", () => {
    if (!isPrivateStaging) {
      for (const artwork of displayArtworks) {
        assert.equal(artwork.rightsApproved && artwork.published, true);
      }
    }
  });

  test("the owner picks lead while the cobalt cover stays in row four", () => {
    if (isPrivateStaging) return;
    assert.deepEqual(
      featuredArtworks.slice(0, 3).map(({ slug }) => slug),
      [
        "graphic-surrealist-minimalism",
        "graphic-surrealist-collage",
        "graphic-surreal-pop",
      ],
    );
    assert.equal(featuredArtworks[14]?.slug, "electric-cobalt-minimalist");
  });

  test("picks a diverse intro-art set with category and mood spread", () => {
    // Mirrors src/lib/artcovr/staging-intro.json. The 2026-08-14 style-cluster
    // thinning removed nesting-appliance, so the regenerated original that
    // inherited its launch slot carries the intro set instead.
    const introSlugs = [
      "cart-of-hours",
      "last-sock-on-the-line",
      "the-dune-observatory",
      "transit-diagram",
      "corrupted-digital-dreamscape",
      "velvet-moss-surrealism",
    ];
    const introArtworks = pickIntroArtworks(reviewCatalog, 6, introSlugs);
    assert.equal(introArtworks.length, 6);
    // Every preferred slug must still resolve: a stale intro list would be
    // silently backfilled by the category fallback instead of failing.
    assert.deepEqual(
      introArtworks.map((artwork) => artwork.slug),
      introSlugs,
    );
    const uniqueCategories = new Set(introArtworks.map((artwork) => artwork.category));
    const uniqueMoods = new Set(introArtworks.flatMap((artwork) => artwork.moodTags));
    const hasGraphic = introArtworks.some((artwork) => artwork.slug === "last-sock-on-the-line");
    const hasMinimal = introArtworks.some((artwork) => artwork.slug === "transit-diagram");
    const hasDigital = introArtworks.some((artwork) => artwork.slug === "corrupted-digital-dreamscape");
    assert.ok(uniqueCategories.size >= 5);
    assert.ok(uniqueMoods.size >= 10);
    assert.ok(hasGraphic && hasMinimal && hasDigital);
  });

  test("the staging intro list stays in sync with the review catalog", async () => {
    const introSlugs = (
      await import("./staging-intro.json", { with: { type: "json" } })
    ).default as string[];
    const reviewSlugs = new Set(reviewCatalog.map((artwork) => artwork.slug));
    for (const slug of introSlugs) {
      assert.ok(reviewSlugs.has(slug), `intro slug ${slug} is not in the review catalog`);
    }
  });

  test("the production intro list resolves against the approved public catalog", async () => {
    const introSlugs = (
      await import("./production-intro.json", { with: { type: "json" } })
    ).default as string[];
    const publicSlugs = new Set(artworks.map((artwork) => artwork.slug));
    for (const slug of introSlugs) {
      assert.ok(publicSlugs.has(slug), `production intro slug ${slug} is missing from the approved catalog`);
    }
    // The preloader relied on a category-priority fallback that picked a near-
    // black cover; the explicit list must be exactly six diverse covers so the
    // default selection is never left to a future sort drift.
    assert.equal(introSlugs.length, 6);
  });

  test("searches artwork metadata across categories, moods, and descriptors", () => {
    const match = searchArtworks("cyan enigmatic collage", reviewCatalog);
    assert.ok(match.some((artwork) => artwork.slug === "cyan-passage"));

    const exactMatch = searchArtworks("cart-of-hours", reviewCatalog);
    assert.ok(exactMatch.some((artwork) => artwork.slug === "cart-of-hours"));
  });

  test("formats a checkout total from cents", () => {
    assert.equal(getCheckoutTotal(null), "Pricing pending owner approval");
  });

  test("requires meaningful prompt direction", () => {
    assert.equal(isPromptReady("  add a nocturnal city horizon  "), true);
    assert.equal(isPromptReady("   "), false);
  });

  test("blocks checkout for unapproved owner art", () => {
    const artwork = reviewCatalog[0];
    assert.ok(artwork);
    assert.equal(isCheckoutReady(artwork), false);
  });
});
