import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildArtworkCollectionStructuredData,
  buildArtworkImageObject,
  buildArtworkStructuredData,
} from "./seo.ts";

const artwork = {
  slug: "blue-hour",
  title: "Blue Hour",
  description: "A blue-toned study in quiet geometric light.",
  image: "/assets/artworks/blue-hour.jpg",
  alt: "Blue geometric cover artwork with quiet nocturnal light.",
  category: "Abstract",
  priceCents: 2400,
  rightsApproved: true,
  published: true,
  saleMode: "repeatable" as const,
  genres: ["Ambient"],
  moodTags: ["quiet", "nocturnal"],
};

describe("artwork image structured data", () => {
  test("publishes searchable image, attribution, and licensing facts", () => {
    const image = buildArtworkImageObject(artwork, "https://example.com");

    assert.equal(image["@type"], "ImageObject");
    assert.equal(image.contentUrl, "https://example.com/assets/artworks/blue-hour.jpg");
    assert.equal(
      image.thumbnailUrl,
      "https://example.com/assets/artworks/optimized/blue-hour-640.webp",
    );
    assert.equal(image.width, 1200);
    assert.equal(image.height, 1200);
    assert.equal(image.caption, artwork.alt);
    assert.equal(image.license, "https://example.com/license");
    assert.equal(
      image.acquireLicensePage,
      "https://example.com/product/blue-hour",
    );
    assert.match(image.keywords, /Ambient, Abstract, quiet, nocturnal/);
  });

  test("links product and collection entities to canonical image objects", () => {
    const product = buildArtworkStructuredData(artwork, "https://example.com");
    const collection = buildArtworkCollectionStructuredData(
      [artwork],
      "https://example.com",
    );

    assert.deepEqual(product["@graph"][2]?.image, {
      "@id": "https://example.com/product/blue-hour#artwork",
    });
    assert.deepEqual(collection["@graph"][0]?.associatedMedia, [
      { "@id": "https://example.com/product/blue-hour#artwork" },
    ]);
    assert.equal(collection["@graph"][1]?.["@type"], "ImageObject");
  });
});