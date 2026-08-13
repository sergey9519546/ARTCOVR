import assert from "node:assert/strict";
import test from "node:test";

import {
  projectApprovedCatalog,
  serializePublicCatalog,
} from "../../src/lib/artcovr/catalog-projection.ts";

const approvedArtwork = {
  id: `art_${"a".repeat(20)}`,
  position: 7,
  slug: "copper-sky",
  title: "Copper Sky",
  description: "A copper cloud over a black sea.",
  alt: "A copper cloud floating over a black sea",
  category: "Surreal",
  mood: "luminous, uncanny",
  width: 2048,
  height: 2048,
  bytes: 1_000_000,
  sha256: "a".repeat(64),
  sourceOrdinal: null,
  sourceMimeType: "image/png",
  sourcePrompt: "A copper cloud over a black sea.",
  privateBasePath: `artworks/art_${"a".repeat(20)}/base`,
  displayPath: "/assets/artworks/copper-sky.jpg",
  validationStatus: "technical-pass",
  rightsApproved: true,
  published: true,
  priceCents: 1999,
  currency: "USD",
  saleMode: "exclusive",
  metadata: {
    styleId: "copper-surrealism",
    keywords: ["copper", "cloud"],
    avoids: [],
    palette: ["copper", "black"],
    lighting: "single-source glow",
    lineworkAndEdges: "soft grain",
    mediumAndTexture: "oil and screenprint",
    compositionAndMotion: "centered ascent",
  },
};

test("approved artifact projects deterministically into sale-ready storefront data", () => {
  const projected = projectApprovedCatalog([approvedArtwork]);

  assert.deepEqual(projected, [
    {
      id: approvedArtwork.id,
      slug: "copper-sky",
      title: "Copper Sky",
      image: "/assets/artworks/copper-sky.jpg",
      alt: "A copper cloud floating over a black sea",
      description: "A copper cloud over a black sea.",
      category: "Surreal",
      moodTags: ["luminous", "uncanny"],
      editionAvailable: null,
      editionTotal: null,
      licenseLabel: "Exclusive commercial license",
      priceCents: 1999,
      saleMode: "exclusive",
      rightsApproved: true,
      published: true,
      accentColor: "#0b0b0b",
    },
  ]);
  assert.equal(serializePublicCatalog([approvedArtwork]), `${JSON.stringify(projected, null, 2)}\n`);
});

test("empty and invalid approval artifacts cannot become public projections", () => {
  assert.throws(() => projectApprovedCatalog([]), /EMPTY_APPROVED_CATALOG/);
  assert.throws(
    () => projectApprovedCatalog([{ ...approvedArtwork, rightsApproved: false }]),
    /NOT_APPROVED/,
  );
});
