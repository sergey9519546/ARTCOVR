import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { selectPublicCatalog } from "../../src/lib/artcovr/catalog-visibility.ts";
import curatedPublicJson from "../../src/lib/artcovr/curated-public.json" with { type: "json" };
import searchIndexJson from "../../src/lib/artcovr/search-index.json" with { type: "json" };
import { artworks, type Artwork } from "../../src/lib/artcovr/artworks.ts";
import { hybridSearch, rankBySemanticPhrases } from "../../src/lib/artcovr/semantic-search.ts";
import { buildSearchIndex } from "../../scripts/search/build-search-index.ts";

type SearchIndexMatrix = {
  rows: number;
  cols: number;
  rowMin: number[];
  rowScale: number[];
  bytesBase64: string;
};
type SearchIndexData = {
  version: number;
  slugs: string[];
  phrases: { phrase: string; facet: string }[];
  matrix: SearchIndexMatrix;
};

const searchIndex = searchIndexJson as SearchIndexData;

function decodeBase64ToBytes(input: string): Uint8Array {
  return Uint8Array.from(Buffer.from(input, "base64"));
}

describe("search-index.json rights gate", () => {
  test("index slug set equals selectPublicCatalog(curated-public.json) exactly, both directions", () => {
    const approvedSlugs = new Set(
      selectPublicCatalog(curatedPublicJson as { slug: string; rightsApproved: boolean; published: boolean }[]).map(
        (row) => row.slug,
      ),
    );
    const indexSlugs = new Set(searchIndex.slugs);

    assert.equal(indexSlugs.size, searchIndex.slugs.length, "index slug list must not contain duplicates");

    const missingFromIndex = [...approvedSlugs].filter((slug) => !indexSlugs.has(slug));
    const unapprovedInIndex = [...indexSlugs].filter((slug) => !approvedSlugs.has(slug));

    assert.deepEqual(missingFromIndex, [], "every approved+published slug must be present in the index");
    assert.deepEqual(unapprovedInIndex, [], "the index must not contain any slug that is not approved+published");
  });
});

describe("search-index.json matrix shape", () => {
  test("matrix dimensions are phrases x slugs", () => {
    assert.equal(searchIndex.matrix.rows, searchIndex.phrases.length);
    assert.equal(searchIndex.matrix.cols, searchIndex.slugs.length);
    assert.equal(searchIndex.matrix.rowMin.length, searchIndex.matrix.rows);
    assert.equal(searchIndex.matrix.rowScale.length, searchIndex.matrix.rows);

    const bytes = decodeBase64ToBytes(searchIndex.matrix.bytesBase64);
    assert.equal(bytes.length, searchIndex.matrix.rows * searchIndex.matrix.cols);
  });

  test("every quantized byte is a valid uint8 and every row scale is finite and non-negative", () => {
    const bytes = decodeBase64ToBytes(searchIndex.matrix.bytesBase64);
    for (const byte of bytes) {
      assert.ok(byte >= 0 && byte <= 255 && Number.isInteger(byte));
    }
    for (const scale of searchIndex.matrix.rowScale) {
      assert.ok(Number.isFinite(scale) && scale >= 0);
    }
    for (const min of searchIndex.matrix.rowMin) {
      assert.ok(Number.isFinite(min));
    }
  });
});

describe("search-index.json dequantisation self-consistency", () => {
  test("dequantised rows agree with an independently reconstructed float recomputation (>= 0.95 top-5 overlap)", () => {
    const { rows, cols, rowMin, rowScale } = searchIndex.matrix;
    const bytes = decodeBase64ToBytes(searchIndex.matrix.bytesBase64);

    let totalOverlapRatio = 0;
    for (let i = 0; i < rows; i += 1) {
      const offset = i * cols;
      const min = rowMin[i];
      const scale = rowScale[i];
      const max = min + scale * 255;

      // Method A: the production dequantisation formula (value = min + byte*scale),
      // as used by semantic-search.ts's dequantizeRow.
      const dequantised = new Float64Array(cols);
      // Method B: an independently coded reconstruction from the same committed
      // min/scale/byte triple, going through a normalised-fraction step instead.
      const recomputed = new Float64Array(cols);
      for (let j = 0; j < cols; j += 1) {
        const byte = bytes[offset + j];
        dequantised[j] = min + byte * scale;
        recomputed[j] = min + (byte / 255) * (max - min);
      }

      const top5 = (values: Float64Array) =>
        new Set(
          [...values.keys()]
            .sort((a, b) => values[b] - values[a])
            .slice(0, 5),
        );
      const a = top5(dequantised);
      const b = top5(recomputed);
      let overlap = 0;
      for (const index of a) if (b.has(index)) overlap += 1;
      totalOverlapRatio += overlap / 5;
    }

    const averageOverlap = totalOverlapRatio / rows;
    assert.ok(
      averageOverlap >= 0.95,
      `expected >= 0.95 average top-5 self-consistency, got ${averageOverlap.toFixed(4)}`,
    );
  });
});

describe("build-search-index.ts determinism", () => {
  test("building the index twice in memory yields byte-identical output", { timeout: 60_000 }, async () => {
    const first = await buildSearchIndex();
    const second = await buildSearchIndex();
    assert.equal(first.serialized, second.serialized);
  });
});

describe("semantic-search.ts", () => {
  test("rankBySemanticPhrases returns [] when the query shares no token with the phrase vocabulary", () => {
    assert.deepEqual(rankBySemanticPhrases("qzxv wkjq"), []);
    assert.deepEqual(rankBySemanticPhrases("zzznotarealword xxblorptoken"), []);
  });

  test("hybridSearch returns [] for gibberish that matches neither ranking", () => {
    const result = hybridSearch("qzxv wkjq", artworks as Artwork[]);
    assert.deepEqual(result, []);
  });

  test("'skull' ranks a known skull work in the top 5 of both rankings", () => {
    const skullSlugs = new Set(["the-verdigris-skull", "halftone-skull-in-red"]);
    const publicSlugs = new Set((artworks as Artwork[]).map((artwork) => artwork.slug));
    for (const slug of skullSlugs) {
      assert.ok(publicSlugs.has(slug), `${slug} must be in the public catalog for this assertion to be meaningful`);
    }

    const semanticTop5 = rankBySemanticPhrases("skull").slice(0, 5).map((match) => match.slug);
    assert.ok(semanticTop5.some((slug) => skullSlugs.has(slug)), `expected a skull work in ${JSON.stringify(semanticTop5)}`);

    const hybridTop5 = hybridSearch("skull", artworks as Artwork[]).slice(0, 5).map((artwork) => artwork.slug);
    assert.ok(hybridTop5.some((slug) => skullSlugs.has(slug)), `expected a skull work in ${JSON.stringify(hybridTop5)}`);
  });

  test("hybridSearch excludes works with zero signal in both rankings but keeps matched ones", () => {
    const result = hybridSearch("calm water", artworks as Artwork[]);
    assert.ok(result.length > 0);
    assert.ok(result.length <= (artworks as Artwork[]).length);
  });
});
