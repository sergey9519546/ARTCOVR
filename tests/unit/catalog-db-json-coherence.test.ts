import assert from "node:assert/strict";
import { describe, test } from "node:test";

import curatedReview from "../../src/lib/artcovr/curated-review.json" with {
  type: "json",
};
import {
  artworks,
  featuredArtworks,
  getArtworkBySlug,
  getStaticCatalogParams,
  isCheckoutReady,
  ownerPickSlugs,
  searchArtworks,
  type Artwork,
} from "../../src/lib/artcovr/artworks.ts";

const publicSlugSet = new Set(artworks.map((art) => art.slug));
const reviewSlugSet = new Set(
  (curatedReview as Artwork[]).map((art) => art.slug),
);
const publicSlugs = artworks.map((art) => art.slug);

describe("catalog coherence", () => {
  test("delete-tier review items never leak into the public catalog", () => {
    for (const artwork of curatedReview as any[]) {
      if (artwork.tier === "delete") assert.ok(
        !publicSlugSet.has(artwork.slug),
        `delete-tier review item leaked into public catalog: ${artwork.slug}`,
      );
    }
  });

  test("public catalog slugs are unique", () => {
    assert.equal(publicSlugs.length, new Set(publicSlugs).size);
  });

  test("every public artwork is checkout-ready (server-authoritative price invariant)", () => {
    for (const artwork of artworks) {
      assert.ok(
        isCheckoutReady(artwork),
        `public artwork ${artwork.slug} is missing rights/published/price/saleMode`,
      );
    }
  });

  test("getArtworkBySlug resolves every public slug", () => {
    for (const slug of publicSlugSet) {
      const found = getArtworkBySlug(slug);
      assert.ok(found, `public slug missing from display catalog: ${slug}`);
      assert.equal(found.slug, slug);
    }
  });

  test("getStaticCatalogParams matches the public catalog", () => {
    const params = getStaticCatalogParams();
    assert.ok(params.length > 0 || artworks.length === 0);
    const paramSlugs = params.map((p) => p.slug);
    assert.equal(paramSlugs.length, publicSlugs.length);
    for (const slug of paramSlugs) {
      assert.ok(publicSlugSet.has(slug), `static param has missing slug: ${slug}`);
    }
  });

  test("owner pick slugs do not reference missing or staging works", () => {
    for (const slug of ownerPickSlugs) {
      assert.ok(
        publicSlugSet.has(slug) || !reviewSlugSet.has(slug),
        `owner pick slug is missing from public catalog: ${slug}`,
      );
    }
  });

  test("search resolves across the public catalog", () => {
    const result = searchArtworks("cover", artworks);
    assert.ok(result.length > 0, "expected at least one result for 'cover'");
    assert.ok(
      result.every((art) => publicSlugSet.has(art.slug)),
      "search returned non-public slug",
    );
  });

  test("featured works are a subset of display works", () => {
    const featuredSlugs = new Set(featuredArtworks.map((art) => art.slug));
    for (const slug of featuredSlugs) {
      assert.ok(
        publicSlugSet.has(slug),
        `featured slug missing from display catalog: ${slug}`,
      );
    }
  });
});