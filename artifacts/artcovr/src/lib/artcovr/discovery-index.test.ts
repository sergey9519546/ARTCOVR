import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { displayArtworks, type Artwork } from "./artworks.ts";
import { getArtworkColors, getArtworkMoods } from "./catalog-intelligence.ts";
import { normalizeDiscoveryGenre, rankGenreArtwork, rankSimilarArtwork } from "./discovery-index.ts";
import { getArtworkGenres, MUSIC_GENRES } from "./genre-index.ts";
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

describe("approved artwork similarity", () => {
  test("visual mode keeps offline neighbor order and does not pad it with the whole catalog", () => {
    const seed = displayArtworks[0];
    const expected = getVisualEntry(seed.slug)!.related.map(({ slug }) => slug);
    const matches = rankSimilarArtwork(seed, [...displayArtworks].reverse());

    assert.deepEqual(matches.map(({ artwork }) => artwork.slug), expected);
    assert.equal(matches.length, 6);
    assert.ok(matches.every(({ basis, reasons }) => basis === "visual-neighbor" && reasons.length > 0));
    assert.deepEqual(rankSimilarArtwork(fixture("no-visual-record"), displayArtworks), []);
  });

  test("caller scope, seed exclusion, approval and deduplication apply in every mode", () => {
    const seed = displayArtworks[0];
    const neighborSlug = getVisualEntry(seed.slug)!.related[0].slug;
    const neighbor = displayArtworks.find(({ slug }) => slug === neighborSlug)!;
    const scope = [seed, neighbor, neighbor];

    for (const mode of ["visual", "palette", "mood"] as const) {
      const matches = rankSimilarArtwork(seed, scope, mode);
      assert.ok(matches.every(({ artwork }) => artwork === neighbor));
      assert.ok(matches.length <= 1);
      assert.deepEqual(rankSimilarArtwork({ ...seed, rightsApproved: false }, scope, mode), []);
      assert.deepEqual(rankSimilarArtwork({ ...seed, published: false }, scope, mode), []);
      assert.deepEqual(rankSimilarArtwork(seed, [{ ...neighbor, rightsApproved: false }], mode), []);
      assert.deepEqual(rankSimilarArtwork(seed, [{ ...neighbor, published: false }], mode), []);
    }
    assert.equal(rankSimilarArtwork(seed, [neighbor]).length, 1);
  });

  test("palette mode requires a shared color and keeps input order on tied matches", () => {
    const seed = fixture("palette-seed", { accentColor: "Blue" });
    const first = fixture("blue-first", { accentColor: "Blue" });
    const second = fixture("blue-second", { accentColor: "Blue" });
    const other = fixture("red", { accentColor: "Red" });
    const matches = rankSimilarArtwork(seed, [other, first, second], "palette");

    assert.deepEqual(matches.map(({ artwork }) => artwork.slug), [first.slug, second.slug]);
    assert.ok(matches.every(({ basis, reasons }) => basis === "shared-palette" && reasons.includes("Shared color: Blue")));
    assert.deepEqual(rankSimilarArtwork(seed, [other], "palette"), []);
  });

  test("mood mode ranks multiple actual shared moods ahead of a single match", () => {
    const seed = fixture("mood-seed", { moodTags: ["quiet", "dreamlike"] });
    const single = fixture("single", { moodTags: ["quiet"] });
    const multiple = fixture("multiple", { moodTags: ["quiet", "dreamlike"] });
    const unrelated = fixture("unrelated", { moodTags: ["macabre"] });
    const matches = rankSimilarArtwork(seed, [single, unrelated, multiple], "mood");

    assert.deepEqual(matches.map(({ artwork }) => artwork.slug), [multiple.slug, single.slug]);
    assert.deepEqual(matches[0].reasons, ["Shared mood: Quiet", "Shared mood: Dreamlike"]);
    assert.ok(matches.every(({ basis }) => basis === "shared-mood"));
    assert.deepEqual(rankSimilarArtwork(seed, [unrelated], "mood"), []);
  });

  test("every catalog trait match has shared evidence without changing the source catalog", () => {
    const originalOrder = displayArtworks.map(({ slug }) => slug);
    for (const seed of displayArtworks) {
      for (const match of rankSimilarArtwork(seed, displayArtworks, "palette")) {
        const samePalette = getVisualEntry(seed.slug)?.labels.colorblend.label === getVisualEntry(match.artwork.slug)?.labels.colorblend.label;
        const colors = new Set(getArtworkColors(seed));
        assert.ok(samePalette || getArtworkColors(match.artwork).some((color) => colors.has(color)));
      }
      for (const match of rankSimilarArtwork(seed, displayArtworks, "mood")) {
        const moods = new Set(getArtworkMoods(seed));
        assert.ok(getArtworkMoods(match.artwork).some((mood) => moods.has(mood)));
      }
    }
    assert.deepEqual(displayArtworks.map(({ slug }) => slug), originalOrder);
  });
});

describe("music-genre visual discovery", () => {
  test("normalizes supported spelling variants without inventing new genre mappings", () => {
    assert.equal(normalizeDiscoveryGenre("R&B"), "r-and-b-soul");
    assert.equal(normalizeDiscoveryGenre("R&B / Soul"), "r-and-b-soul");
    assert.equal(normalizeDiscoveryGenre("hip hop"), "hip-hop");
    assert.equal(normalizeDiscoveryGenre("HIPHOP"), "hip-hop");
    assert.equal(normalizeDiscoveryGenre("  Dream Pop  "), "dream-pop");
    assert.equal(normalizeDiscoveryGenre("lo-fi"), null);
    assert.equal(normalizeDiscoveryGenre("house"), null);
    assert.equal(normalizeDiscoveryGenre("constructor"), null);
    assert.deepEqual(rankGenreArtwork("unsupported genre", displayArtworks), []);
  });

  test("metadata-rule matches lead real vector-supported suggestions with bounded scores", () => {
    let suggestionCount = 0;
    for (const genre of MUSIC_GENRES) {
      const matches = rankGenreArtwork(genre, displayArtworks);
      const direct = displayArtworks.filter((artwork) => getArtworkGenres(artwork).includes(genre));
      assert.deepEqual(matches.slice(0, direct.length).map(({ artwork }) => artwork.slug), direct.map(({ slug }) => slug));
      assert.ok(matches.slice(0, direct.length).every(({ basis }) => basis === "metadata"));
      const directSlugs = new Set(direct.map(({ slug }) => slug));
      for (const match of matches) {
        assert.ok(Number.isFinite(match.score) && match.score > 0 && match.score <= 1);
        assert.ok(match.reasons.length > 0);
        if (match.basis === "metadata") continue;
        suggestionCount += 1;
        assert.equal(directSlugs.has(match.artwork.slug), false);
        const neighbors = getVisualEntry(match.artwork.slug)!.related;
        assert.ok(neighbors.some(({ slug, score }) => directSlugs.has(slug) && score > 0));
        const expected = neighbors.reduce((sum, { slug, score }) => sum + (directSlugs.has(slug) && Number.isFinite(score) && score > 0 ? Math.min(score, 1) : 0), 0) / neighbors.length;
        assert.equal(match.score, expected);
      }
    }
    assert.ok(suggestionCount > 0, "catalog should exercise the neighbor-supported path");
  });

  test("genre propagation cannot borrow private or missing neighbors, or propagate from suggestions", () => {
    const genre = "ambient";
    const ranked = rankGenreArtwork(genre, displayArtworks);
    const candidate = ranked.find(({ basis }) => basis === "visual-neighbor")!.artwork;
    const supportingSlugs = new Set(getVisualEntry(candidate.slug)!.related.map(({ slug }) => slug));
    const supporters = displayArtworks.filter((artwork) => supportingSlugs.has(artwork.slug) && getArtworkGenres(artwork).includes(genre));
    assert.ok(supporters.length > 0);

    assert.deepEqual(rankGenreArtwork(genre, [candidate]), []);
    assert.deepEqual(rankGenreArtwork(genre, [candidate, ...supporters.map((artwork) => ({ ...artwork, rightsApproved: false }))]), []);
    assert.deepEqual(rankGenreArtwork(genre, [candidate, ...supporters.map((artwork) => ({ ...artwork, published: false }))]), []);
    assert.deepEqual(rankGenreArtwork(genre, ranked.filter(({ basis }) => basis === "visual-neighbor").map(({ artwork }) => artwork)), []);
    assert.deepEqual(rankGenreArtwork(genre, [fixture("no-record")]), []);
  });

  test("genre ranking preserves caller scope and does not duplicate results", () => {
    const direct = fixture("minimal", { category: "Minimal / Abstract" });
    const privateWork = fixture("private", { category: "Minimal / Abstract", published: false });
    const matches = rankGenreArtwork("ambient", [direct, privateWork, direct]);
    assert.deepEqual(matches.map(({ artwork }) => artwork.slug), [direct.slug]);
    assert.equal(matches[0].basis, "metadata");
    assert.deepEqual(rankGenreArtwork("ambient", []), []);
  });

  test("IDM evidence identifies its actual category rule before unrelated style metadata", () => {
    const matches = rankGenreArtwork("idm", displayArtworks);
    const direct = matches.filter(({ basis }) => basis === "metadata");
    assert.ok(direct.length > 0);
    for (const match of direct) {
      assert.equal(match.artwork.category, "Digital / Computational");
      assert.equal(match.reasons[1], "Category rule: Digital / Computational");
    }
    assert.ok(matches.filter(({ basis }) => basis === "visual-neighbor").every(({ reasons }) => reasons[0].includes("support for IDM")));
  });
});
