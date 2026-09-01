/**
 * Builds the committed hybrid search artifact: src/lib/artcovr/search-index.json.
 *
 * Inputs live outside the repo, in the offline CLIP-encoding lab at
 * E:/ART_COLLECTION/.artcovr-curation/semantic-lab (override with
 * ARTCOVR_SEMANTIC_LAB_DIR):
 *   - catalog-clip.npy / catalog-clip-names.json  187x512 L2-normalised
 *     CLIP image embeddings of the public catalog, index-aligned to the names.
 *   - phrases.npy / phrases.json                  743x512 L2-normalised CLIP
 *     text embeddings of the phrase vocabulary (vocab.json is the source list;
 *     phrases.json is its embedded, index-aligned counterpart).
 *   - catalog-clip-manifest.json / phrases-manifest.json  encoder recipe.
 *
 * Math (see semantic-lab/rank.py and quantize_check.py for the measured
 * design this mirrors):
 *   1. A = phrases . images^T                        (743 x 187 cosine, both
 *                                                       inputs already L2-normalised)
 *   2. Z-score hubness correction per IMAGE COLUMN: for each work j, its 743
 *      phrase scores are re-centred/re-scaled by their own mean/std. This is
 *      the fix for CLIP's known hubness problem (a handful of catalog images
 *      would otherwise dominate every unrelated phrase's top-k).
 *   3. Per-PHRASE-ROW affine uint8 quantisation: for each phrase i, its 187
 *      (z-scored) work scores are mapped from [min_i, max_i] onto 0..255.
 *      Measured at 0.988 top-5 rank agreement vs the float32 matrix
 *      (quantize_check.py) — the shipped design, in preference to int8
 *      two-tower vectors (measured 13% top-1 loss, rejected).
 *
 * RIGHTS GATE: the build fails, hard, unless the set of slugs in the index
 * equals the set of approved+published slugs in curated-public.json, in both
 * directions. A slug present in the semantic-lab embeddings that is not
 * (still) approved+published must never ship in the client bundle, and a
 * public slug missing embeddings would silently degrade search — both are
 * treated as fatal, never a warning.
 *
 * Determinism: given the same input files, every number here is produced by
 * fixed-order floating point arithmetic with no iteration-order-dependent
 * accumulation (columns/rows are reduced with a plain for-loop in index
 * order), so two runs produce byte-identical JSON. scripts/search/check-search-index.ts
 * relies on this to detect drift.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { readNpyFloat32Matrix } from "./npy.ts";
import { selectPublicCatalog } from "../../src/lib/artcovr/catalog-visibility.ts";
import curatedPublicJson from "../../src/lib/artcovr/curated-public.json" with { type: "json" };

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
export const SEARCH_INDEX_OUTPUT_PATH = path.join(
  projectRoot,
  "src",
  "lib",
  "artcovr",
  "search-index.json",
);

/**
 * Private curation source tree. Not in the repository — it holds pre-approval
 * catalog material. Override with ARTCOVR_SEMANTIC_LAB_DIR on any machine that
 * is not the owner's; `semanticLabAvailable()` lets callers distinguish "the
 * private inputs are absent here" from "the index is genuinely stale".
 */
export const SEMANTIC_LAB_DIR =
  process.env.ARTCOVR_SEMANTIC_LAB_DIR ?? "E:\\ART_COLLECTION\\.artcovr-curation\\semantic-lab";

export function semanticLabAvailable(): boolean {
  return existsSync(path.join(SEMANTIC_LAB_DIR, "catalog-clip-manifest.json"));
}

type PhraseVocabEntry = { phrase: string; source: string; facet: string };
type CatalogVisibilityRow = { slug: string; rightsApproved: boolean; published: boolean };

export type SearchIndexMatrix = {
  rows: number;
  cols: number;
  rowMin: number[];
  rowScale: number[];
  bytesBase64: string;
};

export type SearchIndex = {
  version: number;
  encoder: {
    checkpoint: string;
    dim: number;
    imageRows: number;
    imagePreprocessing: string;
    imageNormalization: string;
    phraseRows: number;
    phraseTemplates: string[];
    phraseEnsemble: string;
  };
  correction: "zscore";
  quantization: "per-row-affine-uint8";
  slugs: string[];
  phrases: { phrase: string; facet: string }[];
  matrix: SearchIndexMatrix;
};

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function assertRightsGate(indexSlugs: readonly string[]) {
  const approvedSlugs = new Set(
    selectPublicCatalog(curatedPublicJson as CatalogVisibilityRow[]).map((row) => row.slug),
  );
  const indexSlugSet = new Set(indexSlugs);

  if (indexSlugSet.size !== indexSlugs.length) {
    throw new Error("Search index rights gate failed: duplicate slug in catalog-clip-names.json.");
  }

  const missingFromIndex = [...approvedSlugs].filter((slug) => !indexSlugSet.has(slug));
  const unapprovedInIndex = indexSlugs.filter((slug) => !approvedSlugs.has(slug));

  if (missingFromIndex.length > 0 || unapprovedInIndex.length > 0) {
    throw new Error(
      "Search index rights gate failed: index slug set must equal selectPublicCatalog(curated-public.json) " +
        `exactly, both directions. Approved+published slugs missing from the index (${missingFromIndex.length}): ` +
        `[${missingFromIndex.join(", ")}]. Slugs present in the index but not approved+published ` +
        `(${unapprovedInIndex.length}): [${unapprovedInIndex.join(", ")}].`,
    );
  }
}

/** Mean and population standard deviation of `column` across all `rows`. */
function columnMeanStd(matrix: Float64Array, rows: number, cols: number, column: number) {
  let sum = 0;
  for (let row = 0; row < rows; row += 1) sum += matrix[row * cols + column];
  const mean = sum / rows;

  let squaredDiffSum = 0;
  for (let row = 0; row < rows; row += 1) {
    const diff = matrix[row * cols + column] - mean;
    squaredDiffSum += diff * diff;
  }
  const std = Math.sqrt(squaredDiffSum / rows);
  return { mean, std };
}

export async function buildSearchIndex(): Promise<{ index: SearchIndex; serialized: string }> {
  const [imageManifest, phraseManifest, slugs, phraseVocab, images, phrases] = await Promise.all([
    readJson<Record<string, unknown>>(path.join(SEMANTIC_LAB_DIR, "catalog-clip-manifest.json")),
    readJson<Record<string, unknown>>(path.join(SEMANTIC_LAB_DIR, "phrases-manifest.json")),
    readJson<string[]>(path.join(SEMANTIC_LAB_DIR, "catalog-clip-names.json")),
    readJson<PhraseVocabEntry[]>(path.join(SEMANTIC_LAB_DIR, "phrases.json")),
    readNpyFloat32Matrix(path.join(SEMANTIC_LAB_DIR, "catalog-clip.npy")),
    readNpyFloat32Matrix(path.join(SEMANTIC_LAB_DIR, "phrases.npy")),
  ]);

  if (images.rows !== slugs.length) {
    throw new Error(
      `catalog-clip.npy has ${images.rows} rows but catalog-clip-names.json has ${slugs.length} names.`,
    );
  }
  if (phrases.rows !== phraseVocab.length) {
    throw new Error(
      `phrases.npy has ${phrases.rows} rows but phrases.json has ${phraseVocab.length} entries.`,
    );
  }
  if (images.cols !== phrases.cols) {
    throw new Error(`Embedding dimension mismatch: images.cols=${images.cols}, phrases.cols=${phrases.cols}.`);
  }

  assertRightsGate(slugs);

  const dim = images.cols;
  const numPhrases = phrases.rows;
  const numImages = images.rows;

  // Step 1: A[i, j] = dot(phrase_i, image_j). Both inputs are already
  // L2-normalised, so this dot product is already the cosine similarity.
  const cosine = new Float64Array(numPhrases * numImages);
  for (let i = 0; i < numPhrases; i += 1) {
    const phraseOffset = i * dim;
    for (let j = 0; j < numImages; j += 1) {
      const imageOffset = j * dim;
      let dot = 0;
      for (let d = 0; d < dim; d += 1) {
        dot += phrases.data[phraseOffset + d] * images.data[imageOffset + d];
      }
      cosine[i * numImages + j] = dot;
    }
  }

  // Step 2: z-score hubness correction, per image column, across all phrases.
  const zscored = new Float64Array(numPhrases * numImages);
  for (let j = 0; j < numImages; j += 1) {
    const { mean, std } = columnMeanStd(cosine, numPhrases, numImages, j);
    const safeStd = std === 0 ? 1 : std;
    for (let i = 0; i < numPhrases; i += 1) {
      zscored[i * numImages + j] = (cosine[i * numImages + j] - mean) / safeStd;
    }
  }

  // Step 3: per-phrase-row affine uint8 quantisation.
  const rowMin = new Array<number>(numPhrases);
  const rowScale = new Array<number>(numPhrases);
  const bytes = new Uint8Array(numPhrases * numImages);
  for (let i = 0; i < numPhrases; i += 1) {
    const rowOffset = i * numImages;
    let min = Infinity;
    let max = -Infinity;
    for (let j = 0; j < numImages; j += 1) {
      const value = zscored[rowOffset + j];
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const range = Math.max(max - min, 1e-12);
    const scale = range / 255;
    rowMin[i] = min;
    rowScale[i] = scale;
    for (let j = 0; j < numImages; j += 1) {
      const quantized = Math.round((zscored[rowOffset + j] - min) / scale);
      bytes[rowOffset + j] = Math.min(255, Math.max(0, quantized));
    }
  }

  const index: SearchIndex = {
    version: 1,
    encoder: {
      checkpoint: String(imageManifest.checkpoint ?? phraseManifest.checkpoint ?? "unknown"),
      dim,
      imageRows: numImages,
      imagePreprocessing: String(imageManifest.preprocessing ?? ""),
      imageNormalization: String(imageManifest.normalization ?? ""),
      phraseRows: numPhrases,
      phraseTemplates: Array.isArray(phraseManifest.templates)
        ? (phraseManifest.templates as string[])
        : [],
      phraseEnsemble: String(phraseManifest.ensemble ?? ""),
    },
    correction: "zscore",
    quantization: "per-row-affine-uint8",
    slugs,
    phrases: phraseVocab.map((entry) => ({ phrase: entry.phrase, facet: entry.facet })),
    matrix: {
      rows: numPhrases,
      cols: numImages,
      rowMin,
      rowScale,
      bytesBase64: Buffer.from(bytes).toString("base64"),
    },
  };

  const serialized = `${JSON.stringify(index, null, 2)}\n`;
  return { index, serialized };
}

const isMainModule = (() => {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return path.resolve(invoked) === path.resolve(fileURLToPath(import.meta.url));
})();

if (isMainModule) {
  const { index, serialized } = await buildSearchIndex();
  await writeFile(SEARCH_INDEX_OUTPUT_PATH, serialized, "utf8");
  console.log(
    JSON.stringify(
      {
        outputPath: SEARCH_INDEX_OUTPUT_PATH,
        phrases: index.phrases.length,
        slugs: index.slugs.length,
        matrixBytes: index.matrix.rows * index.matrix.cols,
      },
      null,
      2,
    ),
  );
}
