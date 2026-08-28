import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

import { decodeImageHeader } from "../../src/lib/artcovr/catalog-source.ts";
import curatedPublic from "../../src/lib/artcovr/curated-public.json" with { type: "json" };

const artworkDirectory = new URL("../../public/assets/artworks/", import.meta.url);

test("public/assets/artworks matches the projected catalog exactly", async () => {
  const entries = (await readdir(artworkDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const expected = (curatedPublic as { slug: string }[])
    .map(({ slug }) => `${slug}.jpg`)
    .sort();
  assert.equal(entries.length, expected.length);
  assert.deepEqual(entries, expected);
});

test("every display derivative is a true baseline JPEG with square dimensions", async () => {
  const entries = (await readdir(artworkDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  for (const name of entries) {
    const bytes = await readFile(new URL(name, artworkDirectory));
    assert.equal(bytes[0], 0xff, `${name}: expected JPEG magic byte 0xFF`);
    assert.equal(bytes[1], 0xd8, `${name}: expected JPEG magic byte 0xD8`);

    const header = decodeImageHeader(bytes);
    assert.equal(header.format, "jpeg", `${name}: expected JPEG format`);
    assert.equal(header.width, header.height, `${name}: expected square dimensions`);
  }
});
