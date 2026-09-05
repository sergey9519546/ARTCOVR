/**
 * Reproducible manifest support for the external catalog intelligence bundle.
 *
 * This module hashes bundle files supplied by an owner-side command. It never
 * imports the bundle or copies its contents into the storefront projection.
 */

import { createHash } from "node:crypto";

import {
  CATALOG_PAYLOAD_FAMILIES,
  CATALOG_VECTOR_DIMENSIONS,
  FULL_CATALOG_SIZE,
  type CatalogPayloadFamily,
  validateCatalogIntelligencePayload,
  type CatalogPayloadValidation,
  type CatalogPayloadValidationInput,
} from "./catalog-payload.ts";
import { CATALOG_INTELLIGENCE_VERSION, INTELLIGENCE_METADATA_CHUNK_FILES } from "./catalog-intelligence.ts";

export const CATALOG_MANIFEST_VERSION = "artcovr-catalog-manifest-v1";

export const CATALOG_MANIFEST_IDENTITY_SOURCE = {
  kind: "catalog-slug-filename",
  slugField: "slug",
  filenameFields: ["assetKey", "filename", "displayPath", "image"],
  filenameNormalization: "basename",
} as const;

export type CatalogManifestFileInput = {
  path: string;
  content: string | Uint8Array;
};

export type CatalogManifestPayload = {
  family: CatalogPayloadFamily;
  path: string;
  bytes: number;
  sha256: string;
};

export type CatalogIntelligenceManifest = {
  manifestVersion: typeof CATALOG_MANIFEST_VERSION;
  intelligenceVersion: string;
  sourceVersion: string;
  identitySource: typeof CATALOG_MANIFEST_IDENTITY_SOURCE;
  corpus: {
    count: number;
    identityCoverage: {
      slugCount: number;
      filenameCount: number;
      identitySha256: string;
    };
  };
  vector: {
    dimensions: number;
  };
  payloads: CatalogManifestPayload[];
};

export type CatalogManifestIssueCode =
  | "MANIFEST_INVALID"
  | "MANIFEST_SOURCE_MISMATCH"
  | "MANIFEST_CORPUS_MISMATCH"
  | "MANIFEST_IDENTITY_MISMATCH"
  | "MANIFEST_VECTOR_DIMENSIONS_MISMATCH"
  | "MANIFEST_FILE_MISSING"
  | "MANIFEST_FILE_UNEXPECTED"
  | "MANIFEST_FILE_DUPLICATE"
  | "MANIFEST_HASH_MISMATCH";

export type CatalogManifestIssue = {
  code: CatalogManifestIssueCode;
  message: string;
  path?: string;
};

export type CatalogManifestVerification = {
  ok: boolean;
  issues: CatalogManifestIssue[];
  manifest: CatalogIntelligenceManifest | null;
};

export type BuildCatalogIntelligenceManifestOptions = {
  catalog: unknown;
  files: readonly CatalogManifestFileInput[];
  sourceVersion: string;
  intelligenceVersion?: string;
  vectorDimensions?: number;
  expectedCorpusSize?: number;
};

export type ValidateCatalogIntelligenceBundleInput = Omit<
  CatalogPayloadValidationInput,
  "options"
> & {
  manifest: unknown;
  manifestFiles: readonly CatalogManifestFileInput[];
  sourceVersion: string;
  vectorDimensions?: number;
  options?: CatalogPayloadValidationInput["options"];
};

export type ImportCatalogIntelligenceBundleInput = Omit<
  ValidateCatalogIntelligenceBundleInput,
  "payload"
> & {
  /**
   * Decode the raw bundle only after its files have passed manifest
   * verification. The decoder receives the same files that were hashed.
   */
  decodePayload: (files: readonly CatalogManifestFileInput[]) => unknown;
};

export type CatalogIntelligenceBundleValidation = CatalogPayloadValidation & {
  manifestVerification: CatalogManifestVerification;
};

const EXPECTED_PAYLOAD_PATHS: readonly { family: CatalogPayloadFamily; path: string }[] = [
  ...INTELLIGENCE_METADATA_CHUNK_FILES.map((path) => ({ family: "metadata" as const, path })),
  { family: "fasttextPredictions", path: "fasttext_predictions.js" },
  { family: "fasttextIndex", path: "fasttext_index.js" },
  { family: "fasttextStats", path: "fasttext_stats.js" },
  { family: "fasttextAnalysis", path: "fasttext_analysis.js" },
  { family: "search", path: "search_index.js" },
  { family: "vectors", path: "embeddings.js" },
  { family: "related", path: "similar.js" },
  { family: "duplicates", path: "duplicates.js" },
];

const EXPECTED_PATH_TO_FAMILY = new Map(
  EXPECTED_PAYLOAD_PATHS.map(({ path, family }) => [path, family]),
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

function basename(value: string): string {
  return value.replaceAll("\\", "/").split("/").pop() ?? value;
}

function normalizedPath(value: string): string | null {
  const path = value.replaceAll("\\", "/");
  if (!path || path.startsWith("/") || path.split("/").includes("..")) return null;
  return path;
}

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function byteLength(content: string | Uint8Array): number {
  return typeof content === "string" ? Buffer.byteLength(content, "utf8") : content.byteLength;
}

function safeNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function catalogIdentities(value: unknown): Array<{ slug: string; assetKey: string }> {
  if (!Array.isArray(value)) {
    throw new Error("Manifest catalog must be an array of slug/filename rows.");
  }

  const identities: Array<{ slug: string; assetKey: string }> = [];
  const slugs = new Set<string>();
  const assets = new Set<string>();
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      throw new Error(`Manifest catalog row ${index} must be an object.`);
    }
    const slug = nonEmptyString(entry.slug);
    const sourcePath = CATALOG_MANIFEST_IDENTITY_SOURCE.filenameFields
      .map((field) => nonEmptyString(entry[field]))
      .find((candidate): candidate is string => Boolean(candidate));
    const assetKey = sourcePath ? basename(sourcePath) : null;
    if (!slug || !assetKey) {
      throw new Error(`Manifest catalog row ${index} must contain slug and filename identity.`);
    }
    if (slugs.has(slug) || assets.has(assetKey)) {
      throw new Error(`Manifest catalog identity is duplicated for ${slug}.`);
    }
    slugs.add(slug);
    assets.add(assetKey);
    identities.push({ slug, assetKey });
  }
  return identities;
}

function identitySha256(identities: readonly { slug: string; assetKey: string }[]): string {
  const canonical = identities
    .map(({ slug, assetKey }) => ({ slug, assetKey }))
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map(({ slug, assetKey }) => `${JSON.stringify(slug)}:${JSON.stringify(assetKey)}`)
    .join("\n");
  return sha256(canonical);
}

export function getCatalogManifestPayloadPaths(): readonly string[] {
  return EXPECTED_PAYLOAD_PATHS.map(({ path }) => path);
}

export function buildCatalogIntelligenceManifest(
  options: BuildCatalogIntelligenceManifestOptions,
): CatalogIntelligenceManifest {
  const identities = catalogIdentities(options.catalog);
  const expectedCorpusSize = options.expectedCorpusSize ?? FULL_CATALOG_SIZE;
  if (identities.length !== expectedCorpusSize) {
    throw new Error(
      `Manifest requires ${expectedCorpusSize} catalog identities; received ${identities.length}.`,
    );
  }
  if (!nonEmptyString(options.sourceVersion)) {
    throw new Error("Manifest sourceVersion must be a non-empty source revision.");
  }
  const vectorDimensions = options.vectorDimensions ?? CATALOG_VECTOR_DIMENSIONS;
  if (!Number.isSafeInteger(vectorDimensions) || vectorDimensions <= 0) {
    throw new Error("Manifest vectorDimensions must be a positive integer.");
  }

  const filesByPath = new Map<string, CatalogManifestFileInput>();
  for (const file of options.files) {
    const path = normalizedPath(file.path);
    if (!path) throw new Error(`Manifest payload path is invalid: ${file.path}.`);
    if (filesByPath.has(path)) throw new Error(`Manifest payload path is duplicated: ${path}.`);
    filesByPath.set(path, { ...file, path });
  }

  const expectedPaths = new Set(getCatalogManifestPayloadPaths());
  const missing = [...expectedPaths].filter((path) => !filesByPath.has(path));
  const unexpected = [...filesByPath.keys()].filter((path) => !expectedPaths.has(path));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      [
        missing.length > 0 ? `missing: ${missing.join(", ")}` : "",
        unexpected.length > 0 ? `unexpected: ${unexpected.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    );
  }

  return {
    manifestVersion: CATALOG_MANIFEST_VERSION,
    intelligenceVersion: options.intelligenceVersion ?? CATALOG_INTELLIGENCE_VERSION,
    sourceVersion: options.sourceVersion,
    identitySource: CATALOG_MANIFEST_IDENTITY_SOURCE,
    corpus: {
      count: identities.length,
      identityCoverage: {
        slugCount: new Set(identities.map(({ slug }) => slug)).size,
        filenameCount: new Set(identities.map(({ assetKey }) => assetKey)).size,
        identitySha256: identitySha256(identities),
      },
    },
    vector: { dimensions: vectorDimensions },
    payloads: EXPECTED_PAYLOAD_PATHS.map(({ family, path }) => {
      const file = filesByPath.get(path);
      if (!file) throw new Error(`Manifest payload path is missing: ${path}.`);
      return {
        family,
        path,
        bytes: byteLength(file.content),
        sha256: sha256(file.content),
      };
    }),
  };
}

function invalidManifest(message: string): CatalogManifestVerification {
  return {
    ok: false,
    issues: [{ code: "MANIFEST_INVALID", message }],
    manifest: null,
  };
}

function parseManifest(value: unknown): CatalogIntelligenceManifest | CatalogManifestVerification {
  if (!isRecord(value)) return invalidManifest("Manifest must be an object.");
  if (value.manifestVersion !== CATALOG_MANIFEST_VERSION) {
    return invalidManifest(`Unsupported manifest version: ${String(value.manifestVersion)}.`);
  }
  const intelligenceVersion = nonEmptyString(value.intelligenceVersion);
  const sourceVersion = nonEmptyString(value.sourceVersion);
  if (!intelligenceVersion || !sourceVersion) {
    return invalidManifest("Manifest must contain intelligenceVersion and sourceVersion.");
  }
  if (!isRecord(value.identitySource) ||
      JSON.stringify(value.identitySource) !== JSON.stringify(CATALOG_MANIFEST_IDENTITY_SOURCE)) {
    return invalidManifest("Manifest identitySource does not match the stable slug/filename contract.");
  }
  const corpus = value.corpus;
  const coverage = isRecord(corpus) ? corpus.identityCoverage : undefined;
  const corpusCount = isRecord(corpus) ? corpus.count : undefined;
  const slugCount = isRecord(coverage) ? coverage.slugCount : undefined;
  const filenameCount = isRecord(coverage) ? coverage.filenameCount : undefined;
  const identityHash = isRecord(coverage) ? coverage.identitySha256 : undefined;
  if (
    !safeNonNegativeInteger(corpusCount) ||
    !safeNonNegativeInteger(slugCount) ||
    !safeNonNegativeInteger(filenameCount) ||
    slugCount !== corpusCount ||
    filenameCount !== corpusCount ||
    typeof identityHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(identityHash)
  ) {
    return invalidManifest("Manifest corpus and identity coverage are malformed.");
  }
  const vector = value.vector;
  const vectorDimensions = isRecord(vector) ? vector.dimensions : undefined;
  if (
    typeof vectorDimensions !== "number" ||
    !Number.isSafeInteger(vectorDimensions) ||
    vectorDimensions <= 0
  ) {
    return invalidManifest("Manifest vector dimensions are malformed.");
  }
  const rawPayloads = value.payloads;
  if (!Array.isArray(rawPayloads)) return invalidManifest("Manifest payloads must be an array.");

  const payloads: CatalogManifestPayload[] = [];
  const paths = new Set<string>();
  for (const entry of rawPayloads) {
    if (!isRecord(entry)) return invalidManifest("Manifest payload entry must be an object.");
    const path = typeof entry.path === "string" ? normalizedPath(entry.path) : null;
    const family = entry.family;
    const bytes = entry.bytes;
    const entryHash = entry.sha256;
    if (
      !path ||
      !CATALOG_PAYLOAD_FAMILIES.includes(family as CatalogPayloadFamily) ||
      paths.has(path) ||
      !safeNonNegativeInteger(bytes) ||
      typeof entryHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(entryHash)
    ) {
      return invalidManifest(`Manifest payload entry is malformed: ${String(entry.path)}.`);
    }
    paths.add(path);
    payloads.push({
      family: family as CatalogPayloadFamily,
      path,
      bytes,
      sha256: entryHash,
    });
  }

  const expectedPaths = new Set(getCatalogManifestPayloadPaths());
  if (
    payloads.length !== expectedPaths.size ||
    payloads.some(({ path, family }) => EXPECTED_PATH_TO_FAMILY.get(path) !== family)
  ) {
    return invalidManifest("Manifest payload set does not match the external viewer contract.");
  }

  return {
    manifestVersion: CATALOG_MANIFEST_VERSION,
    intelligenceVersion,
    sourceVersion,
    identitySource: CATALOG_MANIFEST_IDENTITY_SOURCE,
    corpus: {
      count: corpusCount,
      identityCoverage: {
        slugCount,
        filenameCount,
        identitySha256: identityHash,
      },
    },
    vector: { dimensions: vectorDimensions },
    payloads,
  };
}

export function serializeCatalogIntelligenceManifest(
  manifest: CatalogIntelligenceManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function verifyCatalogIntelligenceManifest(input: {
  manifest: unknown;
  catalog: unknown;
  files: readonly CatalogManifestFileInput[];
  sourceVersion: string;
  vectorDimensions?: number;
  expectedCorpusSize?: number;
}): CatalogManifestVerification {
  const parsed = parseManifest(input.manifest);
  if ("issues" in parsed) return parsed;

  let identities: Array<{ slug: string; assetKey: string }>;
  try {
    identities = catalogIdentities(input.catalog);
  } catch (error) {
    return invalidManifest(error instanceof Error ? error.message : "Catalog identity source is invalid.");
  }

  const issues: CatalogManifestIssue[] = [];
  const expectedCorpusSize = input.expectedCorpusSize ?? parsed.corpus.count;
  if (parsed.sourceVersion !== input.sourceVersion) {
    issues.push({
      code: "MANIFEST_SOURCE_MISMATCH",
      message: `Manifest sourceVersion ${parsed.sourceVersion} does not match incoming ${input.sourceVersion}.`,
    });
  }
  if (identities.length !== expectedCorpusSize ||
      parsed.corpus.count !== identities.length ||
      parsed.corpus.identityCoverage.slugCount !== new Set(identities.map(({ slug }) => slug)).size ||
      parsed.corpus.identityCoverage.filenameCount !== new Set(identities.map(({ assetKey }) => assetKey)).size) {
    issues.push({
      code: "MANIFEST_CORPUS_MISMATCH",
      message:
        `Manifest corpus count/coverage does not match the expected ${expectedCorpusSize}-record incoming catalog (${identities.length}).`,
    });
  }
  if (parsed.corpus.identityCoverage.identitySha256 !== identitySha256(identities)) {
    issues.push({
      code: "MANIFEST_IDENTITY_MISMATCH",
      message: "Manifest stable slug/filename identity hash does not match the incoming catalog.",
    });
  }
  const vectorDimensions = input.vectorDimensions ?? CATALOG_VECTOR_DIMENSIONS;
  if (parsed.vector.dimensions !== vectorDimensions) {
    issues.push({
      code: "MANIFEST_VECTOR_DIMENSIONS_MISMATCH",
      message: `Manifest declares ${parsed.vector.dimensions} vector dimensions; incoming bundle declares ${vectorDimensions}.`,
    });
  }

  const filesByPath = new Map<string, CatalogManifestFileInput>();
  for (const file of input.files) {
    const path = normalizedPath(file.path);
    if (!path) {
      issues.push({
        code: "MANIFEST_FILE_UNEXPECTED",
        message: `Incoming bundle contains an invalid payload path: ${file.path}.`,
        path: file.path,
      });
      continue;
    }
    if (filesByPath.has(path)) {
      issues.push({
        code: "MANIFEST_FILE_DUPLICATE",
        message: `Incoming bundle contains duplicate payload path ${path}.`,
        path,
      });
      continue;
    }
    filesByPath.set(path, { ...file, path });
  }

  const expectedFiles = new Map(parsed.payloads.map((payload) => [payload.path, payload]));
  for (const [path, expected] of expectedFiles) {
    const incoming = filesByPath.get(path);
    if (!incoming) {
      issues.push({
        code: "MANIFEST_FILE_MISSING",
        message: `Incoming bundle is missing manifest payload ${path}.`,
        path,
      });
      continue;
    }
    const actualBytes = byteLength(incoming.content);
    const actualHash = sha256(incoming.content);
    if (expected.bytes !== actualBytes || expected.sha256 !== actualHash) {
      issues.push({
        code: "MANIFEST_HASH_MISMATCH",
        message: `Payload ${path} does not match the manifest hash or byte count.`,
        path,
      });
    }
  }
  for (const path of filesByPath.keys()) {
    if (!expectedFiles.has(path)) {
      issues.push({
        code: "MANIFEST_FILE_UNEXPECTED",
        message: `Incoming bundle contains a payload not listed in the manifest: ${path}.`,
        path,
      });
    }
  }

  return { ok: issues.length === 0, issues, manifest: parsed };
}

function manifestIssuesAsPayloadIssues(
  manifestVerification: CatalogManifestVerification,
): CatalogPayloadValidation["issues"] {
  return manifestVerification.issues.map((manifestIssue) => ({
    family: "catalog" as const,
    code: "MANIFEST_MISMATCH" as const,
    ...(manifestIssue.path ? { key: manifestIssue.path } : {}),
    message: manifestIssue.message,
  }));
}

function rejectedBundleValidation(
  input: Pick<ValidateCatalogIntelligenceBundleInput, "catalog" | "options">,
  manifestVerification: CatalogManifestVerification,
): CatalogIntelligenceBundleValidation {
  // Build the safe report shape without inspecting the incoming payload. The
  // projection is deliberately cleared so a caller cannot accidentally use
  // catalog identities from a rejected import as a partial result.
  const emptyPayloadValidation = validateCatalogIntelligencePayload({
    catalog: input.catalog,
    payload: undefined,
    options: input.options,
  });
  return {
    ...emptyPayloadValidation,
    ok: false,
    completeness: "incomplete",
    integrity: "invalid",
    issues: manifestIssuesAsPayloadIssues(manifestVerification),
    projection: { approvedPublic: [], privateStaging: [] },
    manifestVerification,
  };
}

function combineBundleValidation(
  input: ValidateCatalogIntelligenceBundleInput,
  manifestVerification: CatalogManifestVerification,
): CatalogIntelligenceBundleValidation {
  const payloadValidation = validateCatalogIntelligencePayload({
    catalog: input.catalog,
    payload: input.payload,
    options: input.options,
  });
  const manifestIssues = manifestIssuesAsPayloadIssues(manifestVerification);
  return {
    ...payloadValidation,
    ok: payloadValidation.ok && manifestVerification.ok,
    completeness:
      payloadValidation.completeness === "complete" && manifestVerification.ok
        ? "complete"
        : "incomplete",
    integrity:
      payloadValidation.integrity === "valid" && manifestVerification.ok
        ? "valid"
        : "invalid",
    issues: [...payloadValidation.issues, ...manifestIssues],
    manifestVerification,
  };
}

/**
 * Combined owner-side gate for callers that already have a decoded payload.
 * Manifest verification intentionally runs first so a changed or substituted
 * bundle cannot be inspected or exposed as a partial import.
 */
export function validateCatalogIntelligenceBundle(
  input: ValidateCatalogIntelligenceBundleInput,
): CatalogIntelligenceBundleValidation {
  const manifestVerification = verifyCatalogIntelligenceManifest({
    manifest: input.manifest,
    catalog: input.catalog,
    files: input.manifestFiles,
    sourceVersion: input.sourceVersion,
    vectorDimensions: input.vectorDimensions,
    expectedCorpusSize: input.options?.expectedCorpusSize,
  });
  if (!manifestVerification.ok) return rejectedBundleValidation(input, manifestVerification);
  return combineBundleValidation(input, manifestVerification);
}

/**
 * Owner-side import entry point. Raw bundle files are hashed and compared
 * with the supplied manifest before the decoder is called. A failed manifest
 * returns a rejected, empty projection and never invokes decodePayload.
 */
export function importCatalogIntelligenceBundle(
  input: ImportCatalogIntelligenceBundleInput,
): CatalogIntelligenceBundleValidation {
  const manifestVerification = verifyCatalogIntelligenceManifest({
    manifest: input.manifest,
    catalog: input.catalog,
    files: input.manifestFiles,
    sourceVersion: input.sourceVersion,
    vectorDimensions: input.vectorDimensions,
    expectedCorpusSize: input.options?.expectedCorpusSize,
  });
  if (!manifestVerification.ok) {
    return rejectedBundleValidation(input, manifestVerification);
  }
  return combineBundleValidation(
    { ...input, payload: input.decodePayload(input.manifestFiles) },
    manifestVerification,
  );
}