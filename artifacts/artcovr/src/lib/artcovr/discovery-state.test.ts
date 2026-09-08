import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { displayArtworks, type Artwork } from "./artworks.ts";
import { orderDiscoveryArtwork, readSavedSlugs } from "./discovery-state.ts";
import { getVisualEntry } from "./visual-index.ts";

function fixture(slug: string, overrides: Partial<Artwork> = {}): Artwork {
  return {
    id: slug,
    slug,
    title: slug,
    image: `/assets/artworks/${slug}.jpg`,
    alt: slug,
    description: "Test artwork",
    category: "Test category",
    moodTags: [],
    saleMode: "repeatable",
    priceCents: 1000,
    rightsApproved: true,
    published: true,
    ...overrides,
  };
}

describe("browser crate restoration", () => {
  test("malformed or non-array storage safely restores an empty crate", () => {
    for (const raw of [null, "", "invalid json", "{}", "null", "42", '"slug"']) {
      assert.deepEqual(readSavedSlugs(raw, displayArtworks), []);
    }
  });

  test("restores unique public works in saved order and rejects stale or private identities", () => {
    const first = fixture("first");
    const second = fixture("second");
    const privateWork = fixture("private", { rightsApproved: false });
    const unpublished = fixture("unpublished", { published: false });
    const raw = JSON.stringify([second.slug, privateWork.slug, first.slug, second.slug, unpublished.slug, "removed", 42, {}, null]);

    assert.deepEqual(readSavedSlugs(raw, [first, second, privateWork, unpublished]), [second.slug, first.slug]);
    assert.deepEqual(readSavedSlugs(raw, [first]), [first.slug]);
    assert.deepEqual(readSavedSlugs(raw, []), []);
  });
});

describe("discovery ordering", () => {
  test("recommended preserves incoming relevance and returns an independent array", () => {
    const items = [fixture("z"), fixture("a"), fixture("m")];
    const result = orderDiscoveryArtwork(items, "recommended");
    assert.deepEqual(result, items);
    assert.notEqual(result, items);
    result.pop();
    assert.equal(items.length, 3);
  });

  test("title ordering breaks equal-title ties by slug without mutating relevance order", () => {
    const items = [fixture("z", { title: "Same" }), fixture("b", { title: "Alpha" }), fixture("a", { title: "Same" })];
    assert.deepEqual(orderDiscoveryArtwork(items, "title").map(({ slug }) => slug), ["b", "a", "z"]);
    assert.deepEqual(items.map(({ slug }) => slug), ["z", "b", "a"]);
  });

  test("visual variety orders a subset by its recorded diversity rank without adding works", () => {
    const subset = displayArtworks.filter((_, index) => index % 9 === 0).reverse();
    const inputSlugs = subset.map(({ slug }) => slug);
    const result = orderDiscoveryArtwork(subset, "diverse");
    const ranks = result.map(({ slug }) => getVisualEntry(slug)!.diversityRank);

    assert.deepEqual([...result.map(({ slug }) => slug)].sort(), [...inputSlugs].sort());
    assert.deepEqual(ranks, [...ranks].sort((left, right) => left - right));
    assert.deepEqual(subset.map(({ slug }) => slug), inputSlugs);
  });

  test("missing visual metadata preserves the entire input instead of partially reordering or dropping it", () => {
    const items = [displayArtworks[0], fixture("not-in-visual-index"), displayArtworks[1]];
    const result = orderDiscoveryArtwork(items, "diverse");
    assert.deepEqual(result, items);
    assert.notEqual(result, items);
    for (const order of ["recommended", "title", "diverse"] as const) {
      assert.deepEqual(orderDiscoveryArtwork([], order), []);
    }
  });
});
