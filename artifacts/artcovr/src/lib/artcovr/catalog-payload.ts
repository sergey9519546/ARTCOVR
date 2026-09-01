/**
 * Validation boundary for the external AI catalog bundle referenced by the
 * attached gallery viewers.
 *
 * This module deliberately does not import payload files. The viewer HTML is
 * only a wiring contract and the full bundle is too large for the storefront.
 * An owner-side importer can pass decoded JSON/typed-array payloads here before
 * making any derived data available to an authenticated tool.
 */

export const FULL_CATALOG_SIZE = 22_260;
export const CATALOG_VECTOR_DIMENSIONS = 512;

export const CATALOG_PAYLOAD_FAMILIES = [
  "metadata",
  "fasttextPredictions",
  "fasttextIndex",
  "fasttextStats",
  "fasttextAnalysis",
  "search",
  "vectors",
  "related",
  "duplicates",
] as const;

export type CatalogPayloadFamily = (typeof CATALOG_PAYLOAD_FAMILIES)[number];

export type CatalogPayloadIdentity = {
  slug: string;
  assetKey: string;
  approvedPublic: boolean;
};

export type CatalogPayloadIssueCode =
  | "CATALOG_NOT_ARRAY"
  | "PAYLOAD_NOT_OBJECT"
  | "MISSING_PAYLOAD"
  | "INVALID_PAYLOAD"
  | "MISSING_RECORD"
  | "ORPHAN_PAYLOAD"
  | "STALE_RECORD"
  | "DUPLICATE_PAYLOAD_IDENTITY"
  | "UNAPPROVED_PUBLIC"
  | "DIMENSION_MISMATCH"
  | "RELATED_ORPHAN"
  | "DUPLICATE_CANONICALITY"
  | "INDEX_MISMATCH"
  | "CORPUS_SIZE_MISMATCH";

export type CatalogPayloadIssue = {
  family: CatalogPayloadFamily | "catalog";
  code: CatalogPayloadIssueCode;
  key?: string;
  message: string;
};

export type CatalogPayloadFamilyReport = {
  family: CatalogPayloadFamily;
  status: "missing" | "incomplete" | "invalid" | "valid";
  completeness: "complete" | "incomplete";
  integrity: "valid" | "invalid";
  expectedRecords: number;
  observedRecords: number;
  missingRecords: number;
  orphanRecords: number;
  issues: CatalogPayloadIssue[];
};

export type CatalogPayloadProjection = {
  approvedPublic: CatalogPayloadIdentity[];
  privateStaging: CatalogPayloadIdentity[];
};

export type CatalogPayloadValidation = {
  ok: boolean;
  completeness: "complete" | "incomplete";
  integrity: "valid" | "invalid";
  expectedCorpusSize: number;
  observedCorpusSize: number;
  fullCorpus: boolean;
  reports: Record<CatalogPayloadFamily, CatalogPayloadFamilyReport>;
  issues: CatalogPayloadIssue[];
  projection: CatalogPayloadProjection;
};

export type CatalogPayloadValidationOptions = {
  /**
   * Defaults to FULL_CATALOG_SIZE. A smaller value should only be used by
   * focused tests or an explicitly scoped staging import.
   */
  expectedCorpusSize?: number;
  requireFullCorpus?: boolean;
};

export type CatalogPayloadValidationInput = {
  catalog: unknown;
  payload: unknown;
  options?: CatalogPayloadValidationOptions;
};

type RecordValue = Record<string, unknown>;
type PayloadEntry = { key: string | null; value: RecordValue };

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const basename = (value: string): string => value.replaceAll("\\", "/").split("/").pop() ?? value;

function issue(
  family: CatalogPayloadIssue["family"],
  code: CatalogPayloadIssueCode,
  message: string,
  key?: string,
): CatalogPayloadIssue {
  return { family, code, ...(key ? { key } : {}), message };
}

function asPayloadEntries(value: unknown, prefix = ""): PayloadEntry[] {
  if (Array.isArray(value)) {
    const entries: PayloadEntry[] = [];
    value.forEach((entry, index) => {
      if (isRecord(entry)) {
        entries.push({ key: null, value: entry });
      } else {
        entries.push({ key: `${prefix}[${index}]`, value: { value: entry } });
      }
    });
    return entries;
  }
  if (!isRecord(value)) return [];

  for (const field of ["records", "items", "works", "documents", "data"]) {
    if (field in value && Array.isArray(value[field])) {
      return asPayloadEntries(value[field], prefix);
    }
  }
  if ("chunks" in value && Array.isArray(value.chunks)) {
    return value.chunks.flatMap((chunk) => asPayloadEntries(chunk, prefix));
  }

  return Object.entries(value).flatMap(([key, entry]) => {
    if (isRecord(entry)) return [{ key, value: entry }];
    if (Array.isArray(entry)) {
      if (entry.every((nested) => typeof nested === "string")) {
        return [{ key, value: { related: entry } }];
      }
      return entry.flatMap((nested, index) =>
        isRecord(nested)
          ? [{ key: `${key}[${index}]`, value: nested }]
          : [],
      );
    }
    return [];
  });
}

function identityCandidate(entry: RecordValue, key: string | null) {
  const slug =
    nonEmptyString(entry.slug) ??
    nonEmptyString(entry.prompt_match && isRecord(entry.prompt_match) ? entry.prompt_match.slug : null);
  const explicitAsset =
    nonEmptyString(entry.assetKey) ??
    nonEmptyString(entry.filename) ??
    nonEmptyString(entry.fileName) ??
    nonEmptyString(entry.image);
  const asset = explicitAsset ?? (!slug && key && !key.includes("[") ? key : null);
  return { slug, assetKey: asset ? basename(asset) : null };
}

function catalogIdentities(value: unknown): {
  identities: CatalogPayloadIdentity[];
  issues: CatalogPayloadIssue[];
} {
  if (!Array.isArray(value)) {
    return {
      identities: [],
      issues: [issue("catalog", "CATALOG_NOT_ARRAY", "The identity catalog must be an array.")],
    };
  }

  const identities: CatalogPayloadIdentity[] = [];
  const issues: CatalogPayloadIssue[] = [];
  const slugs = new Set<string>();
  const assets = new Set<string>();

  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      issues.push(issue("catalog", "INVALID_PAYLOAD", `Catalog row ${index} must be an object.`));
      continue;
    }
    const slug = nonEmptyString(entry.slug);
    const sourcePath =
      nonEmptyString(entry.assetKey) ??
      nonEmptyString(entry.filename) ??
      nonEmptyString(entry.displayPath) ??
      nonEmptyString(entry.image);
    const assetKey = sourcePath ? basename(sourcePath) : null;
    if (!slug || !assetKey) {
      issues.push(issue("catalog", "INVALID_PAYLOAD", `Catalog row ${index} must contain slug and filename identity.`));
      continue;
    }
    if (slugs.has(slug) || assets.has(assetKey)) {
      issues.push(issue("catalog", "DUPLICATE_PAYLOAD_IDENTITY", `Catalog identity is duplicated for ${slug}.`, slug));
      continue;
    }
    slugs.add(slug);
    assets.add(assetKey);
    identities.push({
      slug,
      assetKey,
      approvedPublic:
        entry.tier !== "delete" &&
        entry.rightsApproved === true &&
        entry.published === true,
    });
  }
  return { identities, issues };
}

function familyPayload(payload: RecordValue, family: CatalogPayloadFamily): unknown {
  if (family === "metadata") return payload.metadata ?? payload.metadataChunks;
  if (family === "fasttextPredictions") {
    return payload.fasttextPredictions ??
      (isRecord(payload.fasttext) ? payload.fasttext.predictions : undefined) ??
      payload.predictions;
  }
  if (family === "fasttextIndex") {
    return payload.fasttextIndex ??
      (isRecord(payload.fasttext) ? payload.fasttext.index : undefined) ??
      payload.index;
  }
  if (family === "fasttextStats") {
    return payload.fasttextStats ??
      (isRecord(payload.fasttext) ? payload.fasttext.stats : undefined) ??
      payload.stats;
  }
  if (family === "fasttextAnalysis") {
    return payload.fasttextAnalysis ??
      (isRecord(payload.fasttext) ? payload.fasttext.analysis : undefined) ??
      payload.analysis;
  }
  if (family === "search") return payload.search ?? payload.searchIndex ?? payload.search_index;
  if (family === "vectors") return payload.vectors ?? payload.embeddings ?? payload.embedding;
  if (family === "related") return payload.related ?? payload.similar ?? payload.similarData;
  return payload.duplicates ?? payload.duplicateGroups;
}

function payloadEntriesForFamily(payload: unknown, family: CatalogPayloadFamily): PayloadEntry[] {
  if (family === "metadata" && Array.isArray(payload)) {
    if (payload.some((entry) => isRecord(entry) && ("slug" in entry || "filename" in entry))) {
      return asPayloadEntries(payload);
    }
    return payload.flatMap((chunk) => asPayloadEntries(chunk));
  }
  if (family === "vectors" && isRecord(payload)) {
    const ids = payload.slugs ?? payload.filenames ?? payload.ids;
    if (Array.isArray(ids)) {
      return ids.map((id) => ({
        key: typeof id === "string" ? id : null,
        value:
          typeof id === "string"
            ? payload.slugs === ids
              ? { slug: id }
              : { filename: id }
            : {},
      }));
    }
  }
  if (family === "search" && isRecord(payload)) {
    const ids = payload.slugs ?? payload.filenames ?? payload.ids;
    if (Array.isArray(ids)) {
      return ids.map((id) => ({
        key: typeof id === "string" ? id : null,
        value:
          typeof id === "string"
            ? payload.slugs === ids
              ? { slug: id }
              : { filename: id }
            : {},
      }));
    }
  }
  return asPayloadEntries(payload);
}

function resolveIdentity(
  entry: RecordValue,
  key: string | null,
  bySlug: Map<string, CatalogPayloadIdentity>,
  byAsset: Map<string, CatalogPayloadIdentity>,
): { identity: CatalogPayloadIdentity | null; error: CatalogPayloadIssue | null } {
  const candidate = identityCandidate(entry, key);
  const byCandidateSlug = candidate.slug ? bySlug.get(candidate.slug) : undefined;
  const byCandidateAsset = candidate.assetKey ? byAsset.get(candidate.assetKey) : undefined;
  const byKey = key
    ? bySlug.get(key) ?? byAsset.get(basename(key))
    : undefined;
  const identity = byCandidateSlug ?? byCandidateAsset ?? byKey;

  if (!identity) {
    return {
      identity: null,
      error: issue(
        "catalog",
        "ORPHAN_PAYLOAD",
        "Payload record does not resolve to a catalog slug/filename identity.",
        candidate.slug ?? candidate.assetKey ?? key ?? undefined,
      ),
    };
  }
  if (
    (candidate.slug && candidate.slug !== identity.slug) ||
    (candidate.assetKey && candidate.assetKey !== identity.assetKey) ||
    (byCandidateSlug && byCandidateAsset && byCandidateSlug.slug !== byCandidateAsset.slug)
  ) {
    return {
      identity: null,
      error: issue(
        "catalog",
        "STALE_RECORD",
        `Payload identity disagrees with the catalog for ${candidate.slug ?? candidate.assetKey ?? key}.`,
        candidate.slug ?? candidate.assetKey ?? key ?? undefined,
      ),
    };
  }
  return { identity, error: null };
}

function vectorDimensions(payload: unknown): number | null {
  if (!isRecord(payload)) return null;
  const shape = Array.isArray(payload.shape) ? payload.shape : [];
  const dimensions = payload.dimensions ?? payload.dim ?? payload.dimension ?? shape[1];
  return typeof dimensions === "number" && Number.isSafeInteger(dimensions) ? dimensions : null;
}

function duplicateGroups(payload: unknown): RecordValue[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (isRecord(payload) && Array.isArray(payload.groups)) {
    return payload.groups.filter(isRecord);
  }
  return [];
}

function validateFamily(
  family: CatalogPayloadFamily,
  payload: unknown,
  identities: CatalogPayloadIdentity[],
  bySlug: Map<string, CatalogPayloadIdentity>,
  byAsset: Map<string, CatalogPayloadIdentity>,
): CatalogPayloadFamilyReport {
  const expectedRecords =
    family === "fasttextStats" || family === "fasttextIndex"
      ? 0
      : identities.length;
  const familyIssues: CatalogPayloadIssue[] = [];

  if (payload === undefined || payload === null) {
    return {
      family,
      status: "missing",
      completeness: "incomplete",
      integrity: "invalid",
      expectedRecords,
      observedRecords: 0,
      missingRecords: expectedRecords,
      orphanRecords: 0,
      issues: [issue(family, "MISSING_PAYLOAD", `${family} payload is not present.`)],
    };
  }

  if (family === "vectors") {
    const dimensions = vectorDimensions(payload);
    if (dimensions !== CATALOG_VECTOR_DIMENSIONS) {
      familyIssues.push(
        issue(
          family,
          "DIMENSION_MISMATCH",
          `Vector payload must declare ${CATALOG_VECTOR_DIMENSIONS} dimensions; received ${dimensions ?? "none"}.`,
        ),
      );
    }
  }

  // These two FastText artifacts are aggregate lookup data, not one row per
  // image. Their values are intentionally checked without trying to interpret
  // task names/labels as catalog identities.
  if (family === "fasttextStats" || family === "fasttextIndex") {
    if (!isRecord(payload) || Object.keys(payload).length === 0) {
      familyIssues.push(issue(family, "INVALID_PAYLOAD", `${family} payload must be a non-empty object.`));
    }
    if (family === "fasttextIndex") {
      // Index keys are labels and values are filename lists. Validate all
      // referenced filenames even though the index does not have one row/work.
      for (const [task, values] of Object.entries(isRecord(payload) ? payload : {})) {
        if (!isRecord(values)) continue;
        for (const [label, filenames] of Object.entries(values)) {
          if (!Array.isArray(filenames)) continue;
          for (const filename of filenames) {
            if (typeof filename !== "string") continue;
            if (!byAsset.has(basename(filename)) && !bySlug.has(filename)) {
              familyIssues.push(
                issue(
                  family,
                  "INDEX_MISMATCH",
                  `FastText index ${task}/${label} references an unknown filename.`,
                  filename,
                ),
              );
            }
          }
        }
      }
    }
    return {
      family,
      status: familyIssues.length > 0 ? "invalid" : "valid",
      completeness: "complete",
      integrity: familyIssues.length > 0 ? "invalid" : "valid",
      expectedRecords: 0,
      observedRecords: Object.keys(isRecord(payload) ? payload : {}).length,
      missingRecords: 0,
      orphanRecords: 0,
      issues: familyIssues,
    };
  }

  if (family === "duplicates") {
    const groups = duplicateGroups(payload);
    if (!isRecord(payload) || !Array.isArray(payload.groups) && !Array.isArray(payload)) {
      familyIssues.push(issue(family, "INVALID_PAYLOAD", "Duplicate payload must contain a groups array."));
    }
    const seenMembers = new Set<string>();
    for (const [index, group] of groups.entries()) {
      const canonical = nonEmptyString(group.canonical);
      const members = Array.isArray(group.members)
        ? group.members.filter((member): member is string => typeof member === "string")
        : [];
      if (!canonical || !members.includes(canonical)) {
        familyIssues.push(
          issue(family, "DUPLICATE_CANONICALITY", `Duplicate group ${index} must include its canonical member.`, canonical ?? String(index)),
        );
      }
      const redundant = Array.isArray(group.redundant)
        ? group.redundant.filter((member): member is string => typeof member === "string")
        : [];
      for (const member of new Set(members.concat(redundant))) {
        const resolved = resolveIdentity({ filename: member }, member, bySlug, byAsset);
        if (resolved.error) familyIssues.push({ ...resolved.error, family });
        if (seenMembers.has(member)) {
          familyIssues.push(issue(family, "DUPLICATE_CANONICALITY", `Duplicate member ${member} occurs in multiple groups.`, member));
        }
        seenMembers.add(member);
      }
    }
    return {
      family,
      status: familyIssues.length > 0 ? "invalid" : "valid",
      completeness: "complete",
      integrity: familyIssues.length > 0 ? "invalid" : "valid",
      expectedRecords: 0,
      observedRecords: groups.length,
      missingRecords: 0,
      orphanRecords: familyIssues.filter(({ code }) => code === "ORPHAN_PAYLOAD").length,
      issues: familyIssues,
    };
  }

  const entries = payloadEntriesForFamily(payload, family);
  const seen = new Set<string>();
  let orphanRecords = 0;
  for (const { key, value } of entries) {
    const resolved = resolveIdentity(value, key, bySlug, byAsset);
    if (resolved.error) {
      familyIssues.push({ ...resolved.error, family });
      orphanRecords += 1;
      continue;
    }
    if (!resolved.identity) continue;
    if (seen.has(resolved.identity.slug)) {
      familyIssues.push(
        issue(family, "DUPLICATE_PAYLOAD_IDENTITY", `Payload identity ${resolved.identity.slug} occurs more than once.`, resolved.identity.slug),
      );
    }
    seen.add(resolved.identity.slug);
  }

  if (family === "related") {
    for (const { key, value } of entries) {
      const source = resolveIdentity(value, key, bySlug, byAsset);
      if (!source.identity) continue;
      const targets = value.related ?? value.neighbors ?? value.similar;
      if (!Array.isArray(targets)) continue;
      for (const target of targets) {
        const targetKey =
          typeof target === "string"
            ? target
            : isRecord(target)
              ? nonEmptyString(target.slug) ?? nonEmptyString(target.filename)
              : null;
        if (!targetKey) continue;
        const resolvedTarget = resolveIdentity({ filename: targetKey }, targetKey, bySlug, byAsset);
        if (!resolvedTarget.identity) {
          familyIssues.push(
            issue(family, "RELATED_ORPHAN", `Related work ${targetKey} for ${source.identity.slug} is not in the catalog.`, targetKey),
          );
        }
      }
    }
  }

  const missingRecords =
    expectedRecords === 0 ? 0 : Math.max(0, identities.length - seen.size);
  if (missingRecords > 0) {
    familyIssues.push(issue(family, "MISSING_RECORD", `${family} is missing ${missingRecords} catalog identities.`));
  }

  return {
    family,
    status:
      familyIssues.length > 0
        ? familyIssues.some(
            ({ code }) => code !== "MISSING_PAYLOAD" && code !== "MISSING_RECORD",
          )
          ? "invalid"
          : "incomplete"
        : "valid",
    completeness: missingRecords > 0 ? "incomplete" : "complete",
    integrity: familyIssues.length > 0 ? "invalid" : "valid",
    expectedRecords,
    observedRecords: seen.size,
    missingRecords,
    orphanRecords,
    issues: familyIssues,
  };
}

/**
 * Validate a decoded external payload bundle before it is imported. The
 * function never returns a partially trusted dataset as valid.
 */
export function validateCatalogIntelligencePayload(
  input: CatalogPayloadValidationInput,
): CatalogPayloadValidation {
  const catalogResult = catalogIdentities(input.catalog);
  const identities = catalogResult.identities;
  const bySlug = new Map(identities.map((identity) => [identity.slug, identity]));
  const byAsset = new Map(identities.map((identity) => [identity.assetKey, identity]));
  const payload = isRecord(input.payload) ? input.payload : null;
  const expectedCorpusSize = input.options?.expectedCorpusSize ?? FULL_CATALOG_SIZE;
  const requireFullCorpus = input.options?.requireFullCorpus ?? true;
  const issues = [...catalogResult.issues];

  if (!payload) {
    issues.push(issue("catalog", "PAYLOAD_NOT_OBJECT", "The AI catalog payload must be an object."));
  }
  if (requireFullCorpus && identities.length !== expectedCorpusSize) {
    issues.push(
      issue(
        "catalog",
        "CORPUS_SIZE_MISMATCH",
        `The full corpus requires ${expectedCorpusSize} catalog identities; received ${identities.length}.`,
      ),
    );
  }

  const reports = Object.fromEntries(
    CATALOG_PAYLOAD_FAMILIES.map((family) => {
      const report = validateFamily(
        family,
        payload ? familyPayload(payload, family) : undefined,
        identities,
        bySlug,
        byAsset,
      );
      return [family, report];
    }),
  ) as Record<CatalogPayloadFamily, CatalogPayloadFamilyReport>;
  for (const report of Object.values(reports)) issues.push(...report.issues);

  // A bundle may contain a deliberately smaller private staging projection,
  // but an explicitly labelled public projection must never contain an
  // unapproved identity. Unapproved rows remain available only in the
  // privateStaging projection below.
  const publicPayload = payload?.approvedPublic ?? payload?.publicProjection;
  if (publicPayload !== undefined) {
    for (const { key, value } of asPayloadEntries(publicPayload)) {
      const resolved = resolveIdentity(value, key, bySlug, byAsset);
      if (resolved.identity && !resolved.identity.approvedPublic) {
        issues.push(
          issue(
            "catalog",
            "UNAPPROVED_PUBLIC",
            `Unapproved identity ${resolved.identity.slug} cannot enter the approved-public projection.`,
            resolved.identity.slug,
          ),
        );
      }
    }
  }

  const projection: CatalogPayloadProjection = {
    approvedPublic: identities.filter(({ approvedPublic }) => approvedPublic),
    privateStaging: identities.filter(({ approvedPublic }) => !approvedPublic),
  };

  // The private half is intentionally returned separately. No payload content
  // or raw vectors are copied into this result, so this object is safe for
  // public status/health reporting.
  const fullCorpus = identities.length === expectedCorpusSize;
  const completeness = reports.metadata.status === "valid" &&
    reports.fasttextPredictions.status === "valid" &&
    reports.fasttextIndex.status === "valid" &&
    reports.fasttextStats.status === "valid" &&
    reports.fasttextAnalysis.status === "valid" &&
    reports.search.status === "valid" &&
    reports.vectors.status === "valid" &&
    reports.related.status === "valid" &&
    reports.duplicates.status === "valid" &&
    fullCorpus
    ? "complete"
    : "incomplete";
  const integrity = issues.length === 0 ? "valid" : "invalid";
  return {
    ok: issues.length === 0 && completeness === "complete",
    completeness,
    integrity,
    expectedCorpusSize,
    observedCorpusSize: identities.length,
    fullCorpus,
    reports,
    issues,
    projection,
  };
}

export const validateCatalogPayload = validateCatalogIntelligencePayload;

/**
 * Identity-only public/staging projection. It is intentionally not a
 * storefront export function: callers must still pass a successful validation
 * result before using the full bundle.
 */
export function projectCatalogPayloadIdentities(catalog: unknown): CatalogPayloadProjection {
  const result = catalogIdentities(catalog);
  if (result.issues.length > 0) {
    throw new Error(
      `Catalog identity projection failed: ${result.issues.map(({ code }) => code).join(", ")}`,
    );
  }
  return result.identities.reduce<CatalogPayloadProjection>(
    (projection, identity) => {
      projection[identity.approvedPublic ? "approvedPublic" : "privateStaging"].push(identity);
      return projection;
    },
    { approvedPublic: [], privateStaging: [] },
  );
}