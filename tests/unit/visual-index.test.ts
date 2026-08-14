import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import curatedPublic from "../../src/lib/artcovr/curated-public.json" with { type: "json" };
import vocabularies from "../../scripts/catalog/fasttext-vocabularies.json" with { type: "json" };
import {
  VISUAL_TASKS,
  getVisualEntry,
  orderByDiversityRank,
  visualIndex,
  visualLabelSearchTerms,
} from "../../src/lib/artcovr/visual-index.ts";
import {
  buildArtworkSearchText,
  getRelatedArtworks,
  normalizeArtworkSearchValue,
  type Artwork,
} from "../../src/lib/artcovr/artworks.ts";

// Mirrors BANNED_KEYWORD_TERMS in tests/unit/catalog-curation.test.ts: machine
// metadata is held to the same taxonomy governance as curator keywords.
const BANNED_LABEL_TERMS = [
  "masterpiece",
  "best quality",
  "award winning",
  "trending",
  "viral",
  "4k",
  "8k",
  "ultra hd",
  "ai art",
  "ai-generated",
  "prompt",
];

const catalog = curatedPublic as Artwork[];
const catalogSlugs = catalog.map(({ slug }) => slug).sort();
const indexSlugs = Object.keys(visualIndex.works).sort();

test("the visual index covers exactly the public catalog slugs", () => {
  assert.equal(catalogSlugs.length, 100);
  assert.deepEqual(indexSlugs, catalogSlugs);
});

test("every related slug exists in the catalog and never self-references", () => {
  const known = new Set(catalogSlugs);
  for (const slug of indexSlugs) {
    const { related } = visualIndex.works[slug];
    assert.equal(related.length, 6, `${slug}: expected 6 related works`);
    const seen = new Set<string>();
    for (const entry of related) {
      assert.notEqual(entry.slug, slug, `${slug}: related works must not self-reference`);
      assert.ok(known.has(entry.slug), `${slug}: unknown related slug ${entry.slug}`);
      assert.ok(!seen.has(entry.slug), `${slug}: duplicate related slug ${entry.slug}`);
      seen.add(entry.slug);
      assert.ok(
        entry.score > -1.0001 && entry.score <= 1.0001,
        `${slug}: cosine score ${entry.score} out of range`,
      );
    }
    // Related works are ordered most-similar first.
    const scores = related.map(({ score }) => score);
    assert.deepEqual(scores, [...scores].sort((left, right) => right - left));
  }
});

test("diversityRank is a permutation of 0..99", () => {
  const ranks = indexSlugs.map((slug) => visualIndex.works[slug].diversityRank).sort((a, b) => a - b);
  assert.deepEqual(ranks, Array.from({ length: 100 }, (_, index) => index));
});

test("every work carries all 7 fastText-task labels with in-vocabulary values and conf in (0,1]", () => {
  assert.deepEqual([...VISUAL_TASKS], Object.keys(vocabularies.tasks));
  for (const slug of indexSlugs) {
    const { labels } = visualIndex.works[slug];
    assert.deepEqual(Object.keys(labels).sort(), [...VISUAL_TASKS].sort(), `${slug}: label task set`);
    for (const task of VISUAL_TASKS) {
      const entry = labels[task];
      assert.ok(entry, `${slug}: missing ${task} label`);
      assert.ok(
        (vocabularies.tasks[task].labels as string[]).includes(entry.label),
        `${slug}: ${task} label "${entry.label}" is outside the owner's vocabulary`,
      );
      assert.ok(entry.conf > 0 && entry.conf <= 1, `${slug}: ${task} conf ${entry.conf} outside (0,1]`);
    }
  }
});

test("no machine label matches a governance-banned taxonomy term", () => {
  for (const slug of indexSlugs) {
    for (const task of VISUAL_TASKS) {
      const normalized = visualIndex.works[slug].labels[task].label.toLowerCase();
      assert.ok(
        !BANNED_LABEL_TERMS.some((banned) => normalized.includes(banned)),
        `${slug}: ${task} label "${normalized}" matches a governance-banned term`,
      );
    }
  }
});

test("the shipped artifact carries no vectors and the vector artifact is never imported by site code", async () => {
  const shipped = await readFile(
    new URL("../../src/lib/artcovr/visual-index.json", import.meta.url),
    "utf8",
  );
  // Bundle-weight guard: 100 x 512 floats must never reach the client bundle.
  assert.ok(!shipped.includes('"vector"'), "visual-index.json must not contain a vector key");
  assert.ok(!shipped.includes('"vectors"'), "visual-index.json must not contain a vectors key");
  assert.equal(JSON.stringify(visualIndex).includes('"vector"'), false);

  const vectors = JSON.parse(
    await readFile(new URL("../../src/lib/artcovr/visual-vectors.json", import.meta.url), "utf8"),
  ) as { dimensions: number; vectors: Record<string, number[]> };
  assert.equal(vectors.dimensions, 512);
  assert.deepEqual(Object.keys(vectors.vectors).sort(), catalogSlugs);
  for (const slug of catalogSlugs) {
    const vector = vectors.vectors[slug];
    assert.equal(vector.length, 512, `${slug}: expected a 512-d vector`);
    const norm = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
    assert.ok(Math.abs(norm - 1) < 1e-3, `${slug}: vector is not L2-normalized (norm ${norm})`);
  }

  const sourceRoot = new URL("../../src/", import.meta.url);
  const entries = await readdir(sourceRoot, { withFileTypes: true, recursive: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) continue;
    const source = await readFile(path.join(entry.parentPath, entry.name), "utf8");
    assert.ok(
      !/\b(?:import|require)\b[^;\n]*visual-vectors\.json/.test(source),
      `${entry.name} imports visual-vectors.json: the 512-d vectors must never ship`,
    );
  }
});

test("machine labels join the archive search corpus", () => {
  const artwork = catalog.find((row) => row.slug === indexSlugs[0]);
  assert.ok(artwork);
  const haystack = normalizeArtworkSearchValue(buildArtworkSearchText(artwork));
  const terms = visualLabelSearchTerms(artwork.slug);
  assert.ok(terms.length >= VISUAL_TASKS.length);
  for (const term of terms) {
    assert.ok(
      haystack.includes(normalizeArtworkSearchValue(term)),
      `search corpus is missing machine label "${term}"`,
    );
  }
  // A vocabulary label that appears in no curator field must still be findable.
  const style = getVisualEntry(artwork.slug)?.labels.style.label ?? "";
  assert.ok(haystack.includes(normalizeArtworkSearchValue(style)));
});

test("diversity ordering applies to a fully indexed catalog and falls back otherwise", () => {
  const ordered = orderByDiversityRank(catalog);
  assert.ok(ordered);
  assert.deepEqual(
    ordered.map(({ slug }) => visualIndex.works[slug].diversityRank),
    Array.from({ length: 100 }, (_, index) => index),
  );
  // Unindexed works (the private staging catalog) must not produce a partial order.
  assert.equal(orderByDiversityRank([{ slug: "not-in-the-index" }]), null);
  assert.equal(orderByDiversityRank([]), null);
});

test("vector ordering separates the near-duplicate bowl works the category round-robin kept adjacent", () => {
  const ordered = orderByDiversityRank(catalog);
  assert.ok(ordered);
  const positionOf = (slug: string) => ordered.findIndex((artwork) => artwork.slug === slug);
  const clusters: Array<[string, string]> = [
    ["city-in-the-broth", "staircase-soup"],
    ["city-in-the-broth", "storm-in-a-fishbowl"],
    ["staircase-soup", "storm-in-a-fishbowl"],
  ];
  for (const [left, right] of clusters) {
    const distance = Math.abs(positionOf(left) - positionOf(right));
    assert.ok(distance >= 4, `${left}/${right} are ${distance} apart in the diversity order`);
  }
});

test("related works resolve to displayable artworks only", () => {
  for (const slug of indexSlugs.slice(0, 12)) {
    for (const related of getRelatedArtworks(slug, 4)) {
      assert.notEqual(related.slug, slug);
      assert.equal(related.rightsApproved && related.published, true);
    }
  }
  assert.deepEqual(getRelatedArtworks("not-in-the-index", 4), []);
});

test("the product page renders related works as static server markup", async () => {
  const source = await readFile(
    new URL("../../src/app/product/[slug]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /getRelatedArtworks\(art\.slug, 4\)/);
  assert.match(source, /relatedWorks\.length > 0 \? \(/);
  assert.match(source, /id="related-works"/);
  assert.match(source, /href=\{`\/product\/\$\{related\.slug\}`\}/);
  // Server component only: the section must not pull the page into the client.
  assert.doesNotMatch(source, /"use client"/);
});

test("the artifact records an honest provenance header", () => {
  assert.equal(visualIndex.dimensions, 512);
  assert.equal(visualIndex.generatedFrom, "public/assets/artworks display derivatives");
  assert.equal(visualIndex.vocabularySource, "scripts/catalog/fasttext-vocabularies.json");
  // The version strings must name the backend that actually produced the file:
  // a CLIP regeneration writes clip-* versions (ADR-014).
  assert.match(visualIndex.version, /^(artcovr-visual-descriptor-v1|clip-vitb32-v1)$/);
  assert.match(visualIndex.labelVersion, /^(descriptor-rules-v1|clip-zeroshot-v1)$/);
  assert.equal(
    visualIndex.backend,
    visualIndex.version === "clip-vitb32-v1" ? "clip" : "descriptor",
  );
});

test("the vendored vocabularies match the owner's fastText task label sets verbatim", () => {
  assert.deepEqual(vocabularies.tasks.style.labels, [
    "Surrealism",
    "Baroque",
    "Impressionism",
    "Expressionism",
    "Abstract",
    "Minimalism",
  ]);
  assert.deepEqual(vocabularies.tasks.medium.labels, [
    "Oil_Painting",
    "Digital_Art",
    "Watercolor",
    "3D_Render",
    "Photograph",
    "Pencil_Sketch",
  ]);
  assert.deepEqual(vocabularies.tasks.domcolor.labels, [
    "Red",
    "Gray",
    "Blue",
    "Black",
    "Orange",
    "Green",
    "Yellow",
    "White",
    "Purple",
  ]);
  assert.equal(vocabularies.tasks.category.labels.length, 11);
  assert.equal(vocabularies.tasks.weather.labels.length, 12);
  assert.equal(vocabularies.tasks.colorblend.labels.length, 13);
  assert.equal(vocabularies.tasks.mood.labels.length, 6);
});
