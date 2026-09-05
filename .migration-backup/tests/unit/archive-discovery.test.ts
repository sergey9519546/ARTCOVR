import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("archive cards disclose the approved price and sale mode", async () => {
  const card = await source("src/components/artcovr/ArtworkCard.tsx");

  assert.match(card, /getCheckoutTotal\(artwork\.priceCents\)/);
  assert.match(card, /Exclusive license available/);
  assert.match(card, /Repeatable license available/);
  assert.match(card, /Price pending approval/);
  assert.match(card, /aria-label=\{`View \$\{artwork\.title\}/);
});

test("archive filters include sale mode and expose their active state", async () => {
  const archive = await source("src/components/artcovr/ArchiveSearch.tsx");

  assert.match(archive, /type SaleMode = Exclude<Artwork\["saleMode"\], null>/);
  assert.match(archive, /id: "exclusive", label: "Exclusive"/);
  assert.match(archive, /id: "repeatable", label: "Repeatable"/);
  assert.match(archive, /art\.saleMode !== saleMode/);
  assert.match(archive, /<FilterRow label="Sale mode">/);
  assert.match(archive, /aria-pressed=\{active\}/);
  assert.match(archive, /Active: \$\{activeFilterLabels\.join/);
  assert.match(archive, /Showing \{filteredItems\.length\} of \{items\.length\}/);
});

test("archive state is shareable without requiring a dynamic server route", async () => {
  const archive = await source("src/components/artcovr/ArchiveSearch.tsx");

  assert.match(archive, /new URLSearchParams\(window\.location\.search\)/);
  for (const name of ["q", "category", "price", "sale", "mood", "sort"]) {
    assert.match(archive, new RegExp(`setParam\\("${name}"`));
  }
  assert.match(archive, /window\.history\.replaceState/);
  assert.doesNotMatch(archive, /useSearchParams/);
});

test("archive controls have native grouping, focus, and result relationships", async () => {
  const archive = await source("src/components/artcovr/ArchiveSearch.tsx");

  assert.match(archive, /<fieldset/);
  assert.match(archive, /<legend className="sr-only">\{label\}<\/legend>/);
  assert.match(archive, /focus-within:ring-2 focus-within:ring-current/);
  assert.match(archive, /aria-controls="archive-results"/);
  assert.match(archive, /aria-live="polite" aria-atomic="true"/);
  assert.match(archive, /bg-\[var\(--foreground\)\] text-\[var\(--background\)\]/);
  assert.doesNotMatch(archive, /bg-current text-\[var\(--background\)\]/);
  assert.doesNotMatch(archive, /text-current\/50|placeholder:text-current\/45/);
});
