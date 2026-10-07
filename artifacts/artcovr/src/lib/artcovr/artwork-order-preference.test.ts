import assert from "node:assert/strict";
import test from "node:test";
import {
  ARTWORK_ORDER_PREFERENCE_STORAGE_KEY,
  getOrCreateArtworkVisitIndex,
  orderArtworkForVisit,
  readBrowserArtworkOrderPreference,
  writeBrowserArtworkOrderPreference,
  type BrowserStorage,
} from "./artwork-order-preference";
import { orderDiscoveryArtwork } from "./discovery-state";
import type { Artwork } from "./artworks";

class MemoryStorage implements BrowserStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("rotation advances through the stable source order on each visit", () => {
  const artworks = ["a", "b", "c", "d"];

  assert.deepEqual(orderArtworkForVisit(artworks, "rotate", 0), artworks);
  assert.deepEqual(orderArtworkForVisit(artworks, "rotate", 1), [
    "b",
    "c",
    "d",
    "a",
  ]);
  assert.deepEqual(orderArtworkForVisit(artworks, "rotate", 2), [
    "c",
    "d",
    "a",
    "b",
  ]);
  assert.deepEqual(orderArtworkForVisit(artworks, "rotate", 4), artworks);
});

test("shuffle is stable for a visit seed and preserves every artwork once", () => {
  const artworks = ["a", "b", "c", "d", "e", "f"];
  const first = orderArtworkForVisit(artworks, "shuffle", 7);
  const repeat = orderArtworkForVisit(artworks, "shuffle", 7);

  assert.deepEqual(repeat, first);
  assert.deepEqual([...first].sort(), [...artworks].sort());
  assert.notDeepEqual(orderArtworkForVisit(artworks, "shuffle", 8), first);
});

test("browser preference storage accepts only supported values", () => {
  const storage = new MemoryStorage();
  assert.equal(readBrowserArtworkOrderPreference(storage), null);
  assert.equal(writeBrowserArtworkOrderPreference(storage, "shuffle"), true);
  assert.equal(
    storage.getItem(ARTWORK_ORDER_PREFERENCE_STORAGE_KEY),
    "shuffle",
  );
  assert.equal(readBrowserArtworkOrderPreference(storage), "shuffle");

  storage.setItem(ARTWORK_ORDER_PREFERENCE_STORAGE_KEY, "diagonal");
  assert.equal(readBrowserArtworkOrderPreference(storage), null);
});

test("visit index survives reloads in a tab and advances in a new tab", () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  assert.deepEqual(getOrCreateArtworkVisitIndex(session, local), {
    visitIndex: 1,
    persisted: true,
  });
  assert.deepEqual(getOrCreateArtworkVisitIndex(session, local), {
    visitIndex: 1,
    persisted: true,
  });

  assert.deepEqual(getOrCreateArtworkVisitIndex(new MemoryStorage(), local), {
    visitIndex: 2,
    persisted: true,
  });
});

test("explicit archive title order overrides the saved visit preference", () => {
  const artworks = [
    { title: "Zebra", slug: "zebra" },
    { title: "Amber", slug: "amber" },
    { title: "Moss", slug: "moss" },
  ] as Artwork[];

  assert.deepEqual(
    orderDiscoveryArtwork(artworks, "title", "shuffle", 11).map(
      (artwork) => artwork.slug,
    ),
    ["amber", "moss", "zebra"],
  );
});
