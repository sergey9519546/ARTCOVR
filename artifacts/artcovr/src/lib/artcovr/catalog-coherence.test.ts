import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { describe, test } from "node:test";

import curatedPublic from "./curated-public.json" with { type: "json" };
import searchIndexJson from "./search-index.json" with { type: "json" };
import {
  artworks,
  displayArtworks,
  featuredArtworks,
  getArtworkBySlug,
  getArtworkGenres,
  getStaticCatalogParams,
  isCheckoutReady,
  ownerPickSlugs,
  productionIntroSlugs,
  type Artwork,
} from "./artworks.ts";
import { decodeImageHeader } from "./catalog-source.ts";
import { getVisualEntry, visualIndex } from "./visual-index.ts";

type SearchIndexData = {
  slugs: string[];
  matrix: {
    rows: number;
    cols: number;
    rowMin: number[];
    rowScale: number[];
    bytesBase64: string;
  };
};

const publicRows = curatedPublic as Artwork[];
const searchIndex = searchIndexJson as SearchIndexData;
const publicSlugs = publicRows.map((artwork) => artwork.slug);
const publicSlugSet = new Set(publicSlugs);
const sorted = (values: Iterable<string>) => [...values].sort();
const artworkDirectory = new URL("../../../public/assets/artworks/", import.meta.url);

describe("catalog coherence", () => {
  test("public catalog rows are unique, approved, and checkout-ready", () => {
    assert.equal(new Set(publicRows.map((artwork) => artwork.id)).size, publicRows.length);
    assert.equal(new Set(publicSlugs).size, publicRows.length);
    assert.equal(
      new Set(publicRows.map((artwork) => artwork.image)).size,
      publicRows.length,
    );

    for (const artwork of publicRows) {
      assert.equal(artwork.rightsApproved, true, `${artwork.slug}: public row is not rights-approved`);
      assert.equal(artwork.published, true, `${artwork.slug}: public row is not publication-approved`);
      assert.ok(isCheckoutReady(artwork), `${artwork.slug}: public row is not checkout-ready`);
      assert.ok(getArtworkGenres(artwork).length > 0, `${artwork.slug}: public row has no derived genre`);
    }
  });

  test("the visual index covers exactly the public catalog", () => {
    const visualSlugs = Object.keys(visualIndex.works);
    assert.deepEqual(sorted(visualSlugs), sorted(publicSlugs));

    for (const artwork of publicRows) {
      assert.ok(getVisualEntry(artwork.slug), `${artwork.slug}: missing visual-index entry`);
    }
  });

  test("the semantic search index covers exactly the public catalog", () => {
    assert.deepEqual(sorted(searchIndex.slugs), sorted(publicSlugs));
    assert.equal(searchIndex.slugs.length, new Set(searchIndex.slugs).size);
    assert.equal(searchIndex.matrix.rows, searchIndex.matrix.rowMin.length);
    assert.equal(searchIndex.matrix.rows, searchIndex.matrix.rowScale.length);
    assert.equal(searchIndex.matrix.cols, searchIndex.slugs.length);
    assert.ok(searchIndex.matrix.bytesBase64.length > 0);
  });

  test("public display assets are a bijection with the catalog", async () => {
    const files = (await readdir(artworkDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => `/assets/artworks/${entry.name}`);

    assert.deepEqual(sorted(files), sorted(publicRows.map((artwork) => artwork.image)));
  });

  test("every shipped display asset is a square JPEG", async () => {
    const files = (await readdir(artworkDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

    for (const filename of files) {
      const bytes = await readFile(new URL(filename, artworkDirectory));
      const header = decodeImageHeader(bytes);
      assert.equal(header.format, "jpeg", `${filename}: expected JPEG display derivative`);
      assert.equal(header.width, header.height, `${filename}: display derivative must be square`);
    }
  });

  test("owner-selected and preloader references resolve against the public catalog", () => {
    for (const slug of ownerPickSlugs) {
      assert.ok(publicSlugSet.has(slug), `owner pick ${slug} is missing from the public catalog`);
    }
    for (const slug of productionIntroSlugs) {
      assert.ok(publicSlugSet.has(slug), `preloader artwork ${slug} is missing from the public catalog`);
    }

    assert.equal(artworks.length, publicRows.length);
    assert.deepEqual(
      new Set(displayArtworks.map((artwork) => artwork.slug)),
      publicSlugSet,
    );
    assert.ok(featuredArtworks.every((artwork) => publicSlugSet.has(artwork.slug)));

    const staticSlugs = getStaticCatalogParams().map(({ slug }) => slug);
    assert.deepEqual(new Set(staticSlugs), publicSlugSet);
    assert.equal(staticSlugs.length, publicRows.length);

    for (const slug of publicSlugSet) {
      assert.equal(getArtworkBySlug(slug)?.slug, slug, `${slug}: public route cannot resolve artwork`);
    }
  });
});