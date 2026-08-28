import assert from "node:assert/strict";
import test from "node:test";

import { LAUNCH_REVIEW_SIZE } from "../../src/lib/artcovr/catalog-review.ts";

import {
  APPROVAL_HEADERS,
  approvalCommitDecision,
  approvalDataRange,
  candidateToWorkbookRow,
  workbookValuesToApprovalRows,
  workbookCandidateIdentityMatches,
} from "../../scripts/catalog/approval-workbook-schema.mjs";

const candidate = {
  id: "art_aaaaaaaaaaaaaaaaaaaa",
  slug: "copper-sky",
  title: "Copper Sky",
  description: "A copper cloud over a black sea.",
  category: "Surreal",
  mood: "luminous, uncanny",
  width: 2048,
  height: 2048,
  sha256: "a".repeat(64),
  sourceMimeType: "image/png",
  sourcePool: "generated_images",
  privateBasePath: "artworks/art_aaaaaaaaaaaaaaaaaaaa/base",
  displayPath: "/assets/artworks/copper-sky.jpg",
  alt: "A copper cloud floating over a black sea",
  sourcePrompt: "A copper cloud over a black sea.",
  validationStatus: "technical-pass",
  validationIssues: [],
  reviewFlags: [],
};

test("workbook schema keeps source pool in R and private object key in S", () => {
  assert.equal(APPROVAL_HEADERS[17], "Source pool");
  assert.equal(APPROVAL_HEADERS[18], "Private base path");

  const workbookRow = candidateToWorkbookRow(candidate);
  assert.equal(workbookRow[17], candidate.sourcePool);
  assert.equal(workbookRow[18], candidate.privateBasePath);
});

test("owner-editable workbook values round-trip into an approval row without private source paths", () => {
  const workbookRow = candidateToWorkbookRow(candidate);
  workbookRow[6] = 19.99;
  workbookRow[7] = "repeatable";
  workbookRow[8] = true;
  workbookRow[9] = true;
  workbookRow[10] = "approve";

  const [approvalRow] = workbookValuesToApprovalRows([workbookRow]);
  assert.deepEqual(approvalRow, {
    candidateId: candidate.id,
    title: candidate.title,
    description: candidate.description,
    category: candidate.category,
    mood: candidate.mood,
    priceUsd: 19.99,
    saleMode: "repeatable",
    rightsApproved: true,
    published: true,
    decision: "approve",
    technicalStatus: "technical-pass",
    width: 2048,
    height: 2048,
    sha256: candidate.sha256,
    sourcePool: candidate.sourcePool,
    privateBasePath: candidate.privateBasePath,
    displayPath: candidate.displayPath,
    alt: candidate.alt,
    slug: candidate.slug,
  });
  assert.equal("sourceAbsolutePath" in approvalRow, false);
});

test("approval data range grows with the authoritative candidate set", () => {
  assert.equal(approvalDataRange(LAUNCH_REVIEW_SIZE), "A9:X177");
  assert.equal(approvalDataRange(200), "A9:X208");
  assert.throws(() => approvalDataRange(0), /At least one curated candidate/);
});

test("empty or undersized launch approvals cannot replace the approved artifact", () => {
  assert.deepEqual(
    approvalCommitDecision({ approvedCount: 0, issueCount: 0, requireLaunchCatalog: false }),
    {
      launchCountValid: false,
      blockers: ["EMPTY_APPROVAL_SET"],
      canCommit: false,
    },
  );
  assert.deepEqual(
    approvalCommitDecision({ approvedCount: 99, issueCount: 0, requireLaunchCatalog: true }),
    {
      launchCountValid: false,
      blockers: ["LAUNCH_COUNT_OUT_OF_RANGE"],
      canCommit: false,
    },
  );
  assert.equal(
    approvalCommitDecision({ approvedCount: 100, issueCount: 0, requireLaunchCatalog: true }).canCommit,
    true,
  );
});

test("a stale workbook cannot silently approve only part of a growing candidate set", () => {
  const row = workbookValuesToApprovalRows([candidateToWorkbookRow(candidate)])[0];
  assert.equal(workbookCandidateIdentityMatches([row], [candidate]), true);
  assert.equal(workbookCandidateIdentityMatches([row], [candidate, { ...candidate, id: "art_bbbbbbbbbbbbbbbbbbbb" }]), false);
  assert.equal(workbookCandidateIdentityMatches([{ ...row, candidateId: "" }], [candidate]), false);
});
