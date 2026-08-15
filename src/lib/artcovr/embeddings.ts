// Cross-runtime embedding helpers: pure, no `node:*` or `Deno.*` symbols.

export type EmbeddingProvider = (imageBytes: Uint8Array) => Promise<number[]>;

export type EmbeddingRecord = {
  catalogId: string;
  vector: number[];
  model: string;
};

export const EMBEDDING_DIMENSIONS = 768;

export function validateEmbedding(vector: unknown, dimensions = EMBEDDING_DIMENSIONS): number[] {
  if (!Array.isArray(vector)) {
    throw new Error("Embedding must be an array of numbers.");
  }
  if (vector.length !== dimensions) {
    throw new Error(`Embedding length is ${vector.length}; expected ${dimensions}.`);
  }
  let allFinite = true;
  let anyNonZero = false;
  const coerced = vector.map((value) => {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) allFinite = false;
    if (number !== 0) anyNonZero = true;
    return number;
  });
  if (!allFinite) {
    throw new Error("Embedding contains a non-finite value.");
  }
  if (!anyNonZero) {
    throw new Error("Embedding is the zero vector.");
  }
  return coerced;
}

function formatScalar(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Embedding contains a non-finite value.");
  }
  return value.toString();
}

// pgvector literal: '[0.1,0.2,...]'::vector
export function vectorToPgLiteral(vector: number[], dimensions = EMBEDDING_DIMENSIONS): string {
  const validated = validateEmbedding(vector, dimensions);
  const body = validated.map(formatScalar).join(",");
  return `'[${body}]'::vector`;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) {
    throw new Error("cosineSimilarity requires equal-length, non-empty vectors.");
  }
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    dot += a * b;
    leftMagnitude += a * a;
    rightMagnitude += b * b;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

// Novelty = 1 - max cosine similarity to the catalog manifold. Caller passes
// the catalog vectors (already filtered/normalised); higher means more novel.
export function noveltyScore(candidate: number[], catalogVectors: number[][]): number {
  if (catalogVectors.length === 0) return 0;
  let maximum = -Infinity;
  for (const vector of catalogVectors) {
    const similarity = cosineSimilarity(candidate, vector);
    if (similarity > maximum) maximum = similarity;
  }
  const clamped = Math.max(-1, Math.min(1, maximum));
  return 1 - clamped;
}

export function pickTopKNearest(
  reference: number[],
  catalog: Array<{ catalogId: string; vector: number[] }>,
  k: number,
  excludeCatalogId: string | null,
): Array<{ catalogId: string; similarity: number }> {
  if (k <= 0) return [];
  const scored = catalog
    .filter((item) => excludeCatalogId === null || item.catalogId !== excludeCatalogId)
    .map((item) => ({ catalogId: item.catalogId, similarity: cosineSimilarity(reference, item.vector) }));
  scored.sort((left, right) => right.similarity - left.similarity);
  return scored.slice(0, k);
}
