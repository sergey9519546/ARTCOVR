import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePricingOverrides,
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
  const projected = projectApprovedCatalog([{ ...approvedArtwork, tier: "featured" }], new Map());

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
      sourceWidth: 2048,
      sourceHeight: 2048,
      sourceMimeType: "image/png",
      editionAvailable: null,
      editionTotal: null,
      licenseLabel: "Exclusive commercial license",
      priceCents: 1999,
      saleMode: "exclusive",
      rightsApproved: true,
      published: true,
      accentColor: "#0b0b0b",
      tier: "featured",
    },
  ]);
  assert.equal(
    serializePublicCatalog([{ ...approvedArtwork, tier: "featured" }], new Map()),
    `${JSON.stringify(projected, null, 2)}\n`,
  );
});

test("tier gates the projection: deletes drop out, unknown tiers fail safe to archive", () => {
  const kept = projectApprovedCatalog([
    { ...approvedArtwork, tier: "featured" },
    {
      ...approvedArtwork,
      id: `art_${"b".repeat(20)}`,
      slug: "iron-sky",
      sha256: "b".repeat(64),
      privateBasePath: `artworks/art_${"b".repeat(20)}/base`,
      displayPath: "/assets/artworks/iron-sky.jpg",
      position: 8,
      tier: "delete",
    },
    {
      ...approvedArtwork,
      id: `art_${"c".repeat(20)}`,
      slug: "tin-sky",
      sha256: "c".repeat(64),
      privateBasePath: `artworks/art_${"c".repeat(20)}/base`,
      displayPath: "/assets/artworks/tin-sky.jpg",
      position: 9,
      // no tier at all — must never be promoted to featured by accident
    },
  ], new Map());
  assert.deepEqual(
    kept.map(({ slug, tier }) => ({ slug, tier })),
    [
      { slug: "copper-sky", tier: "featured" },
      { slug: "tin-sky", tier: "archive" },
    ],
  );
});

test("empty and invalid approval artifacts cannot become public projections", () => {
  assert.throws(() => projectApprovedCatalog([], new Map()), /EMPTY_APPROVED_CATALOG/);
  assert.throws(
    () => projectApprovedCatalog([{ ...approvedArtwork, rightsApproved: false }], new Map()),
    /NOT_APPROVED/,
  );
  assert.throws(
    () => projectApprovedCatalog([{ ...approvedArtwork, tier: "delete" }], new Map()),
    /EMPTY_APPROVED_CATALOG/,
  );
});

test("pricing overrides fail closed on malformed money or unknown fields", () => {
  assert.throws(() => parsePricingOverrides(null), /JSON object/);
  assert.throws(
    () => parsePricingOverrides({ "copper-sky": { saleMode: "repeatable", priceCents: 0 } }),
    /positive integer/,
  );
  assert.throws(
    () => parsePricingOverrides({ "copper-sky": { saleMode: "repeatable", priceCents: 2500, note: "ignored" } }),
    /unknown fields/,
  );
  assert.deepEqual(
    [...parsePricingOverrides({
      "copper-sky": {
        saleMode: "repeatable",
        priceCents: 2500,
        tier: "archive",
        rightsApproved: true,
      },
    })],
    [[
      "copper-sky",
      { saleMode: "repeatable", priceCents: 2500, tier: "archive", rightsApproved: true },
    ]],
  );
});
