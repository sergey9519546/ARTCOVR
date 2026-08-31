import searchIndexJson from "./search-index.json" with { type: "json" };
import { searchArtworks, type Artwork } from "./artworks.ts";

/**
 * Zero-dependency hybrid (keyword + semantic) search over the public catalog.
 *
 * The semantic side never talks to a model or a network: src/lib/artcovr/
 * search-index.json (built by scripts/search/build-search-index.ts from the
 * offline CLIP-encoding lab) ships a precomputed, quantised phrase x work
 * cosine matrix. At request time this module only tokenises the query,
 * matches tokens against the shipped phrase vocabulary, and does a weighted
 * dequantised row sum — no embedding call, no server round trip, safe for
 * the static export.
 *
 * hybridSearch fuses this semantic ranking with the existing lexical
 * `searchArtworks` ranking via reciprocal-rank fusion (k=60), and drops any
 * work with zero signal in both rankings so the empty state stays honest.
 */

type PhraseEntry = { phrase: string; facet: string };
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
  phrases: PhraseEntry[];
  matrix: SearchIndexMatrix;
};

const searchIndex = searchIndexJson as SearchIndexData;

/** Number of top-matching phrases whose rows are summed for a semantic score. */
const TOP_K_PHRASES = 8;
/** Reciprocal-rank-fusion constant shared by both rankings. */
const RRF_K = 60;

// ---------------------------------------------------------------------------
// Base64 -> bytes, without Buffer/atob so this runs identically in the
// browser bundle, the static-export build, and the Node test runner.
// ---------------------------------------------------------------------------

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

function decodeBase64(input: string): Uint8Array {
  const cleaned = input.replace(/[\r\n]/g, "");
  const withoutPadding = cleaned.replace(/=+$/, "");
  const byteLength = Math.floor((withoutPadding.length * 6) / 8);
  const bytes = new Uint8Array(byteLength);

  let buffer = 0;
  let bitsInBuffer = 0;
  let byteIndex = 0;
  for (let i = 0; i < withoutPadding.length; i += 1) {
    const value = BASE64_LOOKUP[withoutPadding.charCodeAt(i)];
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bitsInBuffer += 6;
    if (bitsInBuffer >= 8) {
      bitsInBuffer -= 8;
      bytes[byteIndex] = (buffer >> bitsInBuffer) & 0xff;
      byteIndex += 1;
    }
  }
  return bytes;
}

let matrixBytes: Uint8Array | null = null;
function getMatrixBytes(): Uint8Array {
  if (!matrixBytes) matrixBytes = decodeBase64(searchIndex.matrix.bytesBase64);
  return matrixBytes;
}

// Rows are dequantised lazily and cached: a query only ever touches
// TOP_K_PHRASES of the 743 rows, so there is no reason to decode all of them
// up front.
const dequantizedRowCache = new Map<number, Float64Array>();
function dequantizeRow(rowIndex: number): Float64Array {
  const cached = dequantizedRowCache.get(rowIndex);
  if (cached) return cached;

  const { cols, rowMin, rowScale } = searchIndex.matrix;
  const bytes = getMatrixBytes();
  const offset = rowIndex * cols;
  const min = rowMin[rowIndex];
  const scale = rowScale[rowIndex];
  const row = new Float64Array(cols);
  for (let j = 0; j < cols; j += 1) {
    row[j] = min + bytes[offset + j] * scale;
  }
  dequantizedRowCache.set(rowIndex, row);
  return row;
}

// ---------------------------------------------------------------------------
// Tokenisation: lowercase, strip punctuation, light stemming, and a small
// alias table for common synonyms that don't share a stem with the
// vocabulary's wording.
// ---------------------------------------------------------------------------

const TOKEN_ALIASES: Record<string, string> = {
  sea: "water",
  ocean: "water",
  lake: "water",
  aqua: "teal",
  cyan: "teal",
  turquoise: "teal",
  azure: "blue",
  quiet: "calm",
  peaceful: "calm",
  tranquil: "calm",
  serene: "calm",
  still: "calm",
  building: "architecture",
  buildings: "architecture",
  structure: "architecture",
  structures: "architecture",
  skyscraper: "architecture",
};

function stemLite(token: string): string {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function tokenize(value: string): string[] {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];
  return normalized
    .split(" ")
    .filter(Boolean)
    .map(stemLite)
    .map((token) => TOKEN_ALIASES[token] ?? token);
}

// ---------------------------------------------------------------------------
// IDF-weighted phrase matching, computed once from the shipped vocabulary.
// ---------------------------------------------------------------------------

type PhraseIndex = {
  tokenSets: Set<string>[];
  idf: Map<string, number>;
};

let phraseIndexCache: PhraseIndex | null = null;
function getPhraseIndex(): PhraseIndex {
  if (phraseIndexCache) return phraseIndexCache;

  const tokenSets = searchIndex.phrases.map((entry) => new Set(tokenize(entry.phrase)));
  const documentFrequency = new Map<string, number>();
  for (const tokens of tokenSets) {
    for (const token of tokens) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const totalPhrases = tokenSets.length;
  const idf = new Map<string, number>();
  for (const [token, df] of documentFrequency) {
    idf.set(token, Math.log((totalPhrases + 1) / (df + 1)) + 1);
  }

  phraseIndexCache = { tokenSets, idf };
  return phraseIndexCache;
}

function phraseOverlapScore(phraseTokens: Set<string>, queryTokens: string[], idf: Map<string, number>) {
  let score = 0;
  const seen = new Set<string>();
  for (const token of queryTokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    if (phraseTokens.has(token)) score += idf.get(token) ?? 1;
  }
  return score;
}

export type SemanticMatch = { slug: string; score: number };

/**
 * Ranks every catalog slug by semantic similarity to `query`, using only the
 * shipped phrase index (no model, no network). Tokenises the query, scores
 * every phrase by IDF-weighted token overlap, keeps the top `topK` matching
 * phrases, and weighted-sums their dequantised score rows.
 *
 * Returns an empty array when the query shares no token (after stemming and
 * alias mapping) with any phrase in the vocabulary — this is the "zero
 * semantic signal" case hybridSearch relies on to keep the empty state honest.
 */
export function rankBySemanticPhrases(query: string, topK: number = TOP_K_PHRASES): SemanticMatch[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const { tokenSets, idf } = getPhraseIndex();
  const scoredPhrases: { rowIndex: number; score: number }[] = [];
  for (let i = 0; i < tokenSets.length; i += 1) {
    const score = phraseOverlapScore(tokenSets[i], queryTokens, idf);
    if (score > 0) scoredPhrases.push({ rowIndex: i, score });
  }
  if (scoredPhrases.length === 0) return [];

  scoredPhrases.sort((a, b) => b.score - a.score);
  const top = scoredPhrases.slice(0, topK);
  const totalWeight = top.reduce((sum, entry) => sum + entry.score, 0);

  const perSlugScore = new Float64Array(searchIndex.slugs.length);
  for (const { rowIndex, score } of top) {
    const weight = score / totalWeight;
    const row = dequantizeRow(rowIndex);
    for (let j = 0; j < row.length; j += 1) {
      perSlugScore[j] += weight * row[j];
    }
  }

  return searchIndex.slugs
    .map((slug, index) => ({ slug, score: perSlugScore[index] }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Reciprocal-rank fusion of the existing lexical `searchArtworks` ranking and
 * the semantic phrase ranking above. A work absent from both rankings is
 * excluded entirely, never padded in with a zero score, so a query that
 * matches nothing keyword-wise or semantically still renders an honest empty
 * result set.
 */
export function hybridSearch(query: string, items: readonly Artwork[]): Artwork[] {
  const lexicalRanked = searchArtworks(query, items);
  const semanticRanked = rankBySemanticPhrases(query);

  const itemSlugs = new Set(items.map((artwork) => artwork.slug));
  const semanticRankedInScope = semanticRanked.filter((match) => itemSlugs.has(match.slug));

  const fusedScore = new Map<string, number>();
  lexicalRanked.forEach((artwork, index) => {
    const rank = index + 1;
    fusedScore.set(artwork.slug, (fusedScore.get(artwork.slug) ?? 0) + 1 / (RRF_K + rank));
  });
  semanticRankedInScope.forEach((match, index) => {
    const rank = index + 1;
    fusedScore.set(match.slug, (fusedScore.get(match.slug) ?? 0) + 1 / (RRF_K + rank));
  });

  const bySlug = new Map(items.map((artwork) => [artwork.slug, artwork]));
  return [...fusedScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([slug]) => bySlug.get(slug))
    .filter((artwork): artwork is Artwork => Boolean(artwork));
}
