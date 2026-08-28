// Build- and test-time module. No app-graph module imports it, so pulling the
// exclusion audit trail in here never reaches the client bundle.
import excludedCandidates from "../../../catalog/excluded-candidates.json" with { type: "json" };

import { REGENERATION_REQUIRED_SOURCE_HASHES } from "./source-exclusions.ts";


export const LAUNCH_REVIEW_SIZE = 169;
export const RETIRED_GENERATED_SOURCE_ORDINALS = new Set([
  59, 60, 76, 77, 89, 96, 101, 117, 128,
]);
export const EXCLUDED_LAUNCH_SOURCE_HASHES = new Set([
  "b26a5c7a2c6e76d45ad1e0d2c3326a9c071f32e4d9aac86f38d3cb2f395c8407",
  "57df7043f88ee4abbdeb47448298410728fb7645781f50de3a5d7da1a6bf40c8",
  "4cea1a7c1f01fae57e07cc8be06a04edf3e40df92fe08efdf63d7b941101571e",
  // Generated #53: manual visual review found readable wall/appliance copy.
  "16f9318705b3968c0457a5845822fdf02ba1c604d30defe3ed0095e65681cf9c",
]);

type ExcludedCandidateRecord = { sha256?: unknown; slug?: unknown; reason?: unknown };

/**
 * catalog/excluded-candidates.json carries two different kinds of audit record.
 *
 * `not_selected_for_launch_review` only records that a technically valid
 * candidate did not win one of the 100 launch slots. Those identities stay
 * eligible and a later rescore may legitimately pick them up.
 *
 * Every other reason is an owner-directed removal (for example
 * `style_cluster_thinning_owner_directive_2026-08-14`, and any `removalReason`
 * that scripts/catalog/swap-launch-works.ts appends when a work is swapped
 * out). Those identities are retired: re-selecting one under a new slug would
 * silently undo the owner's decision.
 *
 * The allowlist holds exactly one non-blocking reason, so an exclusion reason
 * this file has never seen blocks by default — the taxonomy fails closed.
 */
const NON_BLOCKING_EXCLUSION_REASONS = new Set(["not_selected_for_launch_review"]);

const isFullSha256 = (value: string): boolean => /^[0-9a-f]{64}$/.test(value);

/** Every SHA-256 the owner removed from the catalog, read from the audit file. */
export const OWNER_EXCLUDED_SOURCE_HASHES = new Set(
  (excludedCandidates as ExcludedCandidateRecord[])
    .filter((record) => !NON_BLOCKING_EXCLUSION_REASONS.has(String(record.reason ?? "")))
    .map((record) => String(record.sha256 ?? ""))
    .filter(isFullSha256),
);

/**
 * The single blocklist every selector and validator must consult: hardcoded
 * visible-text rejects, regeneration-only identities, and owner exclusions.
 */
export const BLOCKED_LAUNCH_SOURCE_HASHES = new Set<string>([
  ...EXCLUDED_LAUNCH_SOURCE_HASHES,
  ...OWNER_EXCLUDED_SOURCE_HASHES,
  ...REGENERATION_REQUIRED_SOURCE_HASHES,
]);

export function isBlockedLaunchSource(sourceSha256: unknown): boolean {
  return typeof sourceSha256 === "string" && BLOCKED_LAUNCH_SOURCE_HASHES.has(sourceSha256);
}

type CandidateRecord = {
  id?: unknown;
  position?: unknown;
  slug?: unknown;
  sha256?: unknown;
  displayPath?: unknown;
  rightsApproved?: unknown;
  published?: unknown;
  sourcePool?: unknown;
  sourceOrdinal?: unknown;
};

type ReviewRecord = {
  id?: unknown;
  slug?: unknown;
  image?: unknown;
  saleMode?: unknown;
  rightsApproved?: unknown;
  published?: unknown;
};

type SelectionRecord = {
  sourcePool?: unknown;
  sourceOrdinal?: unknown;
  sourceSha256?: unknown;
  moodTags?: unknown;
};

export function validateLaunchReviewIntegrity(input: {
  candidates: unknown;
  review: unknown;
  selection: unknown;
}): string[] {
  const issues: string[] = [];
  if (!Array.isArray(input.candidates)) return ["CANDIDATES_NOT_ARRAY"];
  if (!Array.isArray(input.review)) return ["REVIEW_NOT_ARRAY"];
  if (!Array.isArray(input.selection)) return ["SELECTION_NOT_ARRAY"];

  const candidates = input.candidates as CandidateRecord[];
  const review = input.review as ReviewRecord[];
  const selection = input.selection as SelectionRecord[];

  const selectedById = new Map<string, SelectionRecord>();
  const selectedSourceIdentities = new Set<string>();
  for (const s of selection) {
    const sourcePool = typeof s.sourcePool === "string" ? s.sourcePool : "";
    const sourceOrdinal = Number.isSafeInteger(s.sourceOrdinal) ? String(s.sourceOrdinal) : "";
    const sourceHash = typeof s.sourceSha256 === "string" ? s.sourceSha256 : "";
    const sourceIdentity = `${sourcePool}:${sourceOrdinal || sourceHash}`;
    if (selectedSourceIdentities.has(sourceIdentity)) {
      issues.push(`DUPLICATE_SELECTION_IDENTITY:${sourceIdentity}`);
    }
    selectedSourceIdentities.add(sourceIdentity);
    selectedById.set(sourceIdentity, s);
  }

  const candidateIds = new Set<string>();
  const candidateSlugs = new Set<string>();
  const candidateHashes = new Set<string>();
  const reviewById = new Map<string, ReviewRecord>();

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const r = review[i];
    const id = typeof c.id === "string" ? c.id : "";
    const slug = typeof c.slug === "string" ? c.slug : "";
    const hash = typeof c.sha256 === "string" ? c.sha256 : "";

    if (!/^art_[0-9a-f]{20}$/.test(id) || !/^[0-9a-f]{64}$/.test(hash)) {
      issues.push(`INVALID_IDENTITY:${i}`);
    } else if (id !== `art_${hash.slice(0, 20)}`) {
      issues.push(`SHA_ID_MISMATCH:${i}`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) issues.push(`INVALID_SLUG:${i}`);
    if (candidateIds.has(id)) issues.push(`DUPLICATE_ID:${i}`);
    if (candidateSlugs.has(slug)) issues.push(`DUPLICATE_SLUG:${i}`);
    if (candidateHashes.has(hash)) issues.push(`DUPLICATE_SHA:${i}`);
    candidateIds.add(id);
    candidateSlugs.add(slug);
    candidateHashes.add(hash);

    if (r) {
      reviewById.set(id, r);
      if (
        r.id !== id ||
        r.slug !== slug ||
        r.image !== c.displayPath
      ) issues.push(`REVIEW_MAPPING_MISMATCH:${i}`);
      if (
        c.rightsApproved !== false ||
        c.published !== false ||
        r.rightsApproved !== false ||
        r.published !== false ||
        r.saleMode !== null
      ) issues.push(`REVIEW_PUBLICATION_GATE:${i}`);
    }
  }

  for (let i = 0; i < review.length; i++) {
    const r = review[i];
    const id = typeof r.id === "string" ? r.id : "";
    if (id && !reviewById.has(id)) reviewById.set(id, r);
  }

  for (let i = 0; i < review.length; i++) {
    const r = review[i];
    const id = typeof r.id === "string" ? r.id : "";
    if (id && !reviewById.has(id)) issues.push(`ORPHAN_REVIEW:${i}`);
  }

  for (const [sourceIdentity, s] of selectedById) {
    const c = candidates.find(
      (x) => `${typeof x.sourcePool === "string" ? x.sourcePool : ""}:${Number.isSafeInteger(x.sourceOrdinal) ? String(x.sourceOrdinal) : (typeof x.sha256 === "string" ? x.sha256 : "")}` === sourceIdentity,
    );
    const r = c ? (reviewById.get(c.id as string) as ReviewRecord | undefined) : undefined;
    const id = c?.id ?? "";
    if (!c) issues.push(`SELECTION_ORPHAN:${sourceIdentity}`);
    if (c && r) {
      if (r.id !== id || r.slug !== c.slug || r.image !== c.displayPath) {
        issues.push(`SELECTION_REVIEW_MISMATCH:${sourceIdentity}`);
      }
      if (
        c.rightsApproved !== false ||
        c.published !== false ||
        r.rightsApproved !== false ||
        r.published !== false ||
        r.saleMode !== null
      ) issues.push(`SELECTION_REVIEW_PUBLICATION_GATE:${sourceIdentity}`);
    }
    if (
      s.sourcePool === "generated_images" &&
      typeof s.sourceOrdinal === "number" &&
      RETIRED_GENERATED_SOURCE_ORDINALS.has(s.sourceOrdinal)
    ) issues.push(`RETIRED_SOURCE_SELECTED:${sourceIdentity}`);
    if (
      typeof s.sourceSha256 === "string" &&
      EXCLUDED_LAUNCH_SOURCE_HASHES.has(s.sourceSha256)
    ) issues.push(`EXCLUDED_SOURCE_SELECTED:${sourceIdentity}`);
    if (
      typeof s.sourceSha256 === "string" &&
      REGENERATION_REQUIRED_SOURCE_HASHES.has(s.sourceSha256)
    ) issues.push(`REGENERATION_REQUIRED_SOURCE_SELECTED:${sourceIdentity}`);
    if (
      (typeof s.sourceSha256 === "string" && OWNER_EXCLUDED_SOURCE_HASHES.has(s.sourceSha256)) ||
      (typeof c?.sha256 === "string" && OWNER_EXCLUDED_SOURCE_HASHES.has(c.sha256))
    ) issues.push(`OWNER_EXCLUDED_SOURCE_SELECTED:${sourceIdentity}`);
    if (!Array.isArray(s.moodTags) || s.moodTags.length < 3) {
      issues.push(`MOOD_TAGS_INCOMPLETE:${sourceIdentity}`);
    }
  }

  return issues;
}
