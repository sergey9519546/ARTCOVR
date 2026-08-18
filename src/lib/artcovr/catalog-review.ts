// Build- and test-time module. No app-graph module imports it, so pulling the
// exclusion audit trail in here never reaches the client bundle.
import excludedCandidates from "../../../catalog/excluded-candidates.json" with { type: "json" };

import { REGENERATION_REQUIRED_SOURCE_HASHES } from "./source-exclusions.ts";


export const LAUNCH_REVIEW_SIZE = 100;
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
  if (candidates.length !== LAUNCH_REVIEW_SIZE) issues.push("CANDIDATE_COUNT");
  if (review.length !== LAUNCH_REVIEW_SIZE) issues.push("REVIEW_COUNT");
  if (selection.length !== LAUNCH_REVIEW_SIZE) issues.push("SELECTION_COUNT");
  if (candidates.length !== review.length || review.length !== selection.length) issues.push("SIZE_MISMATCH");

  const ids = new Set<string>();
  const slugs = new Set<string>();
  const hashes = new Set<string>();
  const sourceIdentities = new Set<string>();
  for (let index = 0; index < Math.max(candidates.length, review.length, selection.length); index += 1) {
    const candidate = candidates[index];
    const publicReview = review[index];
    const selected = selection[index];
    if (!candidate || !publicReview || !selected) continue;

    const id = typeof candidate.id === "string" ? candidate.id : "";
    const slug = typeof candidate.slug === "string" ? candidate.slug : "";
    const hash = typeof candidate.sha256 === "string" ? candidate.sha256 : "";
    const sourcePool = typeof selected.sourcePool === "string" ? selected.sourcePool : "";
    const sourceOrdinal = Number.isSafeInteger(selected.sourceOrdinal)
      ? String(selected.sourceOrdinal)
      : "";
    const sourceHash = typeof selected.sourceSha256 === "string" ? selected.sourceSha256 : "";
    const sourceIdentity = `${sourcePool}:${sourceOrdinal || sourceHash}`;

    if (
      sourcePool === "generated_images" &&
      typeof selected.sourceOrdinal === "number" &&
      RETIRED_GENERATED_SOURCE_ORDINALS.has(selected.sourceOrdinal)
    ) {
      issues.push(`RETIRED_SOURCE_SELECTED:${index}`);
    }
    if (sourceHash && REGENERATION_REQUIRED_SOURCE_HASHES.has(sourceHash)) {
      issues.push(`REGENERATION_REQUIRED_SOURCE_SELECTED:${index}`);
    }
    if (sourceHash && EXCLUDED_LAUNCH_SOURCE_HASHES.has(sourceHash)) {
      issues.push(`EXCLUDED_SOURCE_SELECTED:${index}`);
    }
    // An owner-removed identity may not return under a new slug. Both the
    // selection's declared source hash and the candidate's own file hash are
    // checked: a direct-use pool copies bytes, so either one can carry a
    // retired identity back into the launch set.
    if (
      (sourceHash && OWNER_EXCLUDED_SOURCE_HASHES.has(sourceHash)) ||
      (hash && OWNER_EXCLUDED_SOURCE_HASHES.has(hash))
    ) {
      issues.push(`OWNER_EXCLUDED_SOURCE_SELECTED:${index}`);
    }

    if (!/^art_[0-9a-f]{20}$/.test(id) || !/^[0-9a-f]{64}$/.test(hash)) {
      issues.push(`INVALID_IDENTITY:${index}`);
    } else if (id !== `art_${hash.slice(0, 20)}`) {
      issues.push(`SHA_ID_MISMATCH:${index}`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) issues.push(`INVALID_SLUG:${index}`);
    if (candidate.position !== index + 1) issues.push(`POSITION_MISMATCH:${index}`);
    if (ids.has(id)) issues.push(`DUPLICATE_ID:${index}`);
    if (slugs.has(slug)) issues.push(`DUPLICATE_SLUG:${index}`);
    if (hashes.has(hash)) issues.push(`DUPLICATE_SHA:${index}`);
    if (sourceIdentities.has(sourceIdentity)) issues.push(`DUPLICATE_SOURCE:${index}`);
    ids.add(id);
    slugs.add(slug);
    hashes.add(hash);
    sourceIdentities.add(sourceIdentity);

    if (
      publicReview.id !== id ||
      publicReview.slug !== slug ||
      publicReview.image !== candidate.displayPath
    ) {
      issues.push(`REVIEW_MAPPING_MISMATCH:${index}`);
    }
    if (
      candidate.rightsApproved !== false ||
      candidate.published !== false ||
      publicReview.rightsApproved !== false ||
      publicReview.published !== false ||
      publicReview.saleMode !== null
    ) {
      issues.push(`REVIEW_PUBLICATION_GATE:${index}`);
    }
    if (candidate.sourcePool !== selected.sourcePool) issues.push(`SOURCE_POOL_MISMATCH:${index}`);
    if (selected.sourceOrdinal !== undefined && candidate.sourceOrdinal !== selected.sourceOrdinal) {
      issues.push(`SOURCE_ORDINAL_MISMATCH:${index}`);
    }
    if (selected.sourceSha256 !== undefined && hash !== selected.sourceSha256) {
      issues.push(`SOURCE_SHA_MISMATCH:${index}`);
    }
    if (!Array.isArray(selected.moodTags) || selected.moodTags.length < 3) {
      issues.push(`MOOD_TAGS_INCOMPLETE:${index}`);
    }
  }

  return issues;
}
