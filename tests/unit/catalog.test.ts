import assert from "node:assert/strict";
import test from "node:test";

import {
  getPublishedArtworks,
  validateCatalog,
  type CatalogArtwork,
} from "../../src/lib/artcovr/catalog.ts";

const validArtwork = (overrides: Partial<CatalogArtwork> = {}): CatalogArtwork => ({
  id: "9bf15c81-f97a-45dc-bd1e-50ff9aab4c96",
  slug: "signal-in-bloom",
  title: "Signal in Bloom",
  description: "A luminous botanical signal rendered as square cover art.",
  category: "Surreal",
  mood: "Luminous",
  priceCents: 12500,
  currency: "USD",
  saleMode: "repeatable",
  width: 2048,
  height: 2048,
  sha256: "a".repeat(64),
  sourcePath: "source/9bf15c81-f97a-45dc-bd1e-50ff9aab4c96/original.png",
  displayPath: "/artworks/signal-in-bloom.webp",
  alt: "Luminous flowers emerging from a dark geometric signal field",
  rightsApproved: true,
  published: true,
  ...overrides,
});

test("accepts a unique, rights-approved square artwork at least 1024 pixels", () => {
  assert.deepEqual(validateCatalog([validArtwork()]), []);
});

test("rejects non-square, undersized, and rights-unapproved catalog entries", () => {
  const issues = validateCatalog([
    validArtwork({ width: 1440, height: 810 }),
    validArtwork({ id: "2a8f1356-0f7d-4f27-a71a-e688fd5c3f74", slug: "small", width: 768, height: 768, sha256: "b".repeat(64) }),
    validArtwork({ id: "13f75bbf-8b79-4706-9d53-4ddb49f0c3be", slug: "pending-rights", rightsApproved: false, sha256: "c".repeat(64) }),
  ]);

  assert.deepEqual(
    issues.map((issue) => issue.code),
    ["NOT_SQUARE", "TOO_SMALL", "RIGHTS_NOT_APPROVED"],
  );
});

test("rejects duplicate content hashes even when filenames and titles differ", () => {
  const issues = validateCatalog([
    validArtwork(),
    validArtwork({
      id: "92754fa0-26b7-4928-a7bd-a04ac73c217e",
      slug: "signal-in-bloom-variant",
      title: "Signal in Bloom Variant",
    }),
  ]);

  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.code, "DUPLICATE_SHA256");
});

test("publishes only approved entries explicitly marked for publication", () => {
  const publicCatalog = getPublishedArtworks([
    validArtwork(),
    validArtwork({ id: "5d5eb809-9b19-49b9-a9e1-1efed8658621", slug: "draft", published: false, sha256: "d".repeat(64) }),
    validArtwork({ id: "51ba021d-7c01-4fdf-b447-871632012150", slug: "unapproved", rightsApproved: false, sha256: "e".repeat(64) }),
  ]);

  assert.deepEqual(publicCatalog.map((artwork) => artwork.slug), ["signal-in-bloom"]);
});
