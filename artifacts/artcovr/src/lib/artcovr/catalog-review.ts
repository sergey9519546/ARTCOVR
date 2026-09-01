import curatedReview from "./curated-review.json" with { type: "json" };

/**
 * The review catalog JSON is the maintained source of truth for its size.
 * Keeping this derived value in the helper module preserves the existing
 * catalog checks without duplicating a manually maintained count.
 */
export const LAUNCH_REVIEW_SIZE = (curatedReview as unknown[]).length;

type CatalogRecord = Record<string, unknown>;

export type CatalogIntegrityIssue = {
  code:
    | "SOURCE_NOT_ARRAY"
    | "REVIEW_NOT_ARRAY"
    | "PUBLIC_NOT_ARRAY"
    | "SOURCE_ROW_NOT_OBJECT"
    | "REVIEW_ROW_NOT_OBJECT"
    | "PUBLIC_ROW_NOT_OBJECT"
    | "SOURCE_INVALID_IDENTITY"
    | "SOURCE_DUPLICATE_ID"
    | "SOURCE_DUPLICATE_SLUG"
    | "SOURCE_INVALID_DISPLAY_PATH"
    | "SOURCE_PUBLICATION_GATE"
    | "REVIEW_INVALID_IDENTITY"
    | "REVIEW_DUPLICATE_ID"
    | "REVIEW_DUPLICATE_SLUG"
    | "ORPHAN_REVIEW"
    | "REVIEW_SLUG_MISMATCH"
    | "REVIEW_IMAGE_MISMATCH"
    | "REVIEW_PUBLICATION_GATE"
    | "PUBLIC_INVALID_IDENTITY"
    | "PUBLIC_DUPLICATE_ID"
    | "PUBLIC_DUPLICATE_SLUG"
    | "ORPHAN_PUBLIC_PROJECTION"
    | "PUBLIC_SLUG_MISMATCH"
    | "PUBLIC_IMAGE_MISMATCH"
    | "PUBLIC_TIER_MISMATCH"
    | "PUBLIC_PUBLICATION_GATE"
    | "PUBLIC_ROW_MISSING";
  index: number;
  id: string | null;
  slug: string | null;
};

export type CatalogIntegrityInput = {
  source: unknown;
  review: unknown;
  public: unknown;
};

const isRecord = (value: unknown): value is CatalogRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const issue = (
  code: CatalogIntegrityIssue["code"],
  index: number,
  record?: CatalogRecord,
): CatalogIntegrityIssue => ({
  code,
  index,
  id: stringValue(record?.id),
  slug: stringValue(record?.slug),
});

const issueKey = (entry: CatalogIntegrityIssue): string =>
  `${entry.code}:${entry.index}:${entry.id ?? ""}:${entry.slug ?? ""}`;

/**
 * Checks the source catalog and both checked-in projections without touching
 * the browser or the application graph.
 *
 * The source is the owner-approved catalog. Review rows are allowed to be a
 * historical subset of that source, but must preserve identity and display
 * image while remaining closed behind the private publication gate. Public
 * rows must be the exact non-delete, approved source set and must carry the
 * public gate. Comparing by both id and slug catches a stale projection that
 * accidentally reuses an identity under a renamed slug.
 */
export function validateCatalogIntegrity(
  input: CatalogIntegrityInput,
): CatalogIntegrityIssue[] {
  const issues: CatalogIntegrityIssue[] = [];
  if (!Array.isArray(input.source)) issues.push(issue("SOURCE_NOT_ARRAY", -1));
  if (!Array.isArray(input.review)) issues.push(issue("REVIEW_NOT_ARRAY", -1));
  if (!Array.isArray(input.public)) issues.push(issue("PUBLIC_NOT_ARRAY", -1));
  if (issues.length > 0) return issues;

  const source = input.source as unknown[];
  const review = input.review as unknown[];
  const publicRows = input.public as unknown[];
  const sourceById = new Map<string, CatalogRecord>();
  const sourceIds = new Set<string>();
  const sourceSlugs = new Set<string>();

  for (const [index, value] of source.entries()) {
    if (!isRecord(value)) {
      issues.push(issue("SOURCE_ROW_NOT_OBJECT", index));
      continue;
    }
    const id = stringValue(value.id);
    const slug = stringValue(value.slug);
    if (!id || !slug) {
      issues.push(issue("SOURCE_INVALID_IDENTITY", index, value));
    } else {
      if (sourceIds.has(id))
        issues.push(issue("SOURCE_DUPLICATE_ID", index, value));
      if (sourceSlugs.has(slug))
        issues.push(issue("SOURCE_DUPLICATE_SLUG", index, value));
      sourceIds.add(id);
      sourceSlugs.add(slug);
      sourceById.set(id, value);
    }
    if (!stringValue(value.displayPath)) {
      issues.push(issue("SOURCE_INVALID_DISPLAY_PATH", index, value));
    }
    if (
      value.tier !== "delete" &&
      (value.rightsApproved !== true || value.published !== true)
    ) {
      issues.push(issue("SOURCE_PUBLICATION_GATE", index, value));
    }
  }

  const reviewIds = new Set<string>();
  const reviewSlugs = new Set<string>();
  for (const [index, value] of review.entries()) {
    if (!isRecord(value)) {
      issues.push(issue("REVIEW_ROW_NOT_OBJECT", index));
      continue;
    }
    const id = stringValue(value.id);
    const slug = stringValue(value.slug);
    if (!id || !slug) {
      issues.push(issue("REVIEW_INVALID_IDENTITY", index, value));
      continue;
    }
    if (reviewIds.has(id))
      issues.push(issue("REVIEW_DUPLICATE_ID", index, value));
    if (reviewSlugs.has(slug))
      issues.push(issue("REVIEW_DUPLICATE_SLUG", index, value));
    reviewIds.add(id);
    reviewSlugs.add(slug);

    const sourceRow = sourceById.get(id);
    if (!sourceRow) {
      issues.push(issue("ORPHAN_REVIEW", index, value));
    } else {
      if (slug !== sourceRow.slug)
        issues.push(issue("REVIEW_SLUG_MISMATCH", index, value));
      if (value.image !== sourceRow.displayPath) {
        issues.push(issue("REVIEW_IMAGE_MISMATCH", index, value));
      }
    }
    if (
      value.rightsApproved !== false ||
      value.published !== false ||
      value.saleMode !== null
    ) {
      issues.push(issue("REVIEW_PUBLICATION_GATE", index, value));
    }
  }

  const publicIds = new Set<string>();
  const publicSlugs = new Set<string>();
  const expectedPublicIds = new Set(
    source
      .filter(
        (value): value is CatalogRecord =>
          isRecord(value) &&
          value.tier !== "delete" &&
          value.rightsApproved === true &&
          value.published === true &&
          typeof value.id === "string",
      )
      .map((value) => value.id as string),
  );

  for (const [index, value] of publicRows.entries()) {
    if (!isRecord(value)) {
      issues.push(issue("PUBLIC_ROW_NOT_OBJECT", index));
      continue;
    }
    const id = stringValue(value.id);
    const slug = stringValue(value.slug);
    if (!id || !slug) {
      issues.push(issue("PUBLIC_INVALID_IDENTITY", index, value));
      continue;
    }
    if (publicIds.has(id))
      issues.push(issue("PUBLIC_DUPLICATE_ID", index, value));
    if (publicSlugs.has(slug))
      issues.push(issue("PUBLIC_DUPLICATE_SLUG", index, value));
    publicIds.add(id);
    publicSlugs.add(slug);

    const sourceRow = sourceById.get(id);
    if (
      !sourceRow ||
      sourceRow.tier === "delete" ||
      !expectedPublicIds.has(id)
    ) {
      issues.push(issue("ORPHAN_PUBLIC_PROJECTION", index, value));
    } else {
      if (slug !== sourceRow.slug)
        issues.push(issue("PUBLIC_SLUG_MISMATCH", index, value));
      if (value.image !== sourceRow.displayPath) {
        issues.push(issue("PUBLIC_IMAGE_MISMATCH", index, value));
      }
      if (value.tier !== sourceRow.tier) {
        issues.push(issue("PUBLIC_TIER_MISMATCH", index, value));
      }
    }
    if (value.rightsApproved !== true || value.published !== true) {
      issues.push(issue("PUBLIC_PUBLICATION_GATE", index, value));
    }
  }

  for (const [index, value] of source.entries()) {
    if (!isRecord(value) || typeof value.id !== "string") continue;
    if (expectedPublicIds.has(value.id) && !publicIds.has(value.id)) {
      issues.push(issue("PUBLIC_ROW_MISSING", index, value));
    }
  }

  return issues.filter(
    (entry, index, all) =>
      all.findIndex((candidate) => issueKey(candidate) === issueKey(entry)) ===
      index,
  );
}
