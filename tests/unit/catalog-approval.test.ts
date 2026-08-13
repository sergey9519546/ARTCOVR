import assert from "node:assert/strict";
import test from "node:test";

import {
  validateApprovalRows,
  type ApprovalCandidate,
  type ApprovalRow,
} from "../../src/lib/artcovr/catalog-approval.ts";

const candidate: ApprovalCandidate = {
  id: "fef3946d-9d05-56aa-a6d2-78da5d89a875",
  slug: "ethereal-cloud-surrealism",
  width: 1254,
  height: 1254,
  sha256: "a".repeat(64),
  sourcePool: "generated_images",
  privateBasePath: "source/fef3946d/original.jpg",
  displayPath: "/assets/artworks/002-ethereal-cloud-surrealism.jpg",
  validationStatus: "technical-pass",
};

const approvedRow = (overrides: Partial<ApprovalRow> = {}): ApprovalRow => ({
  candidateId: candidate.id,
  title: "Ethereal Cloud Surrealism",
  description: "A cloud stairway beyond the horizon.",
  category: "Surreal",
  mood: "Ethereal",
  priceUsd: 125,
  saleMode: "repeatable",
  rightsApproved: true,
  published: true,
  decision: "approve",
  technicalStatus: "technical-pass",
  width: 1254,
  height: 1254,
  sha256: candidate.sha256,
  sourcePool: candidate.sourcePool,
  privateBasePath: candidate.privateBasePath,
  displayPath: candidate.displayPath,
  alt: "A luminous staircase winding through lavender clouds",
  slug: candidate.slug,
  ...overrides,
});

test("normalizes a complete owner-approved row into import-ready catalog data", () => {
  const result = validateApprovalRows([approvedRow()], [candidate]);

  assert.deepEqual(result.issues, []);
  assert.equal(result.approved.length, 1);
  assert.equal(result.approved[0]?.priceCents, 12500);
  assert.equal(result.approved[0]?.currency, "USD");
});

test("accepts ordinary two-decimal USD prices without binary floating-point rejection", () => {
  const result = validateApprovalRows([approvedRow({ priceUsd: 19.99 })], [candidate]);

  assert.deepEqual(result.issues, []);
  assert.equal(result.approved[0]?.priceCents, 1999);
});

test("rejects approved rows missing any launch gate", () => {
  const result = validateApprovalRows(
    [approvedRow({ mood: "", rightsApproved: false, published: false, priceUsd: 0, saleMode: "" })],
    [candidate],
  );

  assert.deepEqual(
    result.issues.map(({ code }) => code),
    ["MISSING_MOOD", "INVALID_PRICE", "INVALID_SALE_MODE", "RIGHTS_NOT_APPROVED", "NOT_PUBLISHED"],
  );
  assert.equal(result.approved.length, 0);
});

test("rejects source metadata tampering", () => {
  const result = validateApprovalRows(
    [approvedRow({ sha256: "b".repeat(64), width: 2048, sourcePool: "wrong_pool" })],
    [candidate],
  );

  assert.deepEqual(
    result.issues.map(({ code }) => code),
    ["SOURCE_MISMATCH"],
  );
});

test("keeps pending and rejected rows private without treating them as import errors", () => {
  const result = validateApprovalRows(
    [approvedRow({ decision: "pending" }), approvedRow({ decision: "reject" })],
    [candidate],
  );

  assert.deepEqual(result, { approved: [], issues: [] });
});
