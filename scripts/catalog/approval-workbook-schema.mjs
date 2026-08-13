import { createHash } from "node:crypto";

export const APPROVAL_SHEET_NAME = "Artwork Approval";
export const APPROVAL_FIRST_DATA_ROW = 9;

export const APPROVAL_HEADERS = Object.freeze([
  "Preview",
  "Candidate ID",
  "Title",
  "Description",
  "Category",
  "Mood",
  "Price (USD)",
  "Sale mode",
  "Rights approved",
  "Publish",
  "Decision",
  "Technical status",
  "Ready to import",
  "Width",
  "Height",
  "SHA-256",
  "Source MIME",
  "Source pool",
  "Private base path",
  "Display path",
  "Alt text",
  "Source prompt",
  "Slug",
  "Validation issues",
]);

export const APPROVAL_LAST_COLUMN = "X";

const text = (value) => (value === null || value === undefined ? "" : String(value).trim());

const number = (value) => {
  if (typeof value === "number") return value;
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const boolean = (value) => value === true || text(value).toUpperCase() === "TRUE";

export function candidateToWorkbookRow(candidate) {
  return [
    "",
    candidate.id,
    candidate.title,
    candidate.description,
    candidate.category,
    candidate.mood,
    null,
    null,
    false,
    false,
    "pending",
    candidate.validationStatus,
    null,
    candidate.width,
    candidate.height,
    candidate.sha256,
    candidate.sourceMimeType,
    candidate.sourcePool,
    candidate.privateBasePath,
    candidate.displayPath,
    candidate.alt,
    candidate.sourcePrompt,
    candidate.slug,
    [...(candidate.validationIssues ?? []), ...(candidate.reviewFlags ?? [])].join(" | "),
  ];
}

export function workbookValuesToApprovalRows(values) {
  return values.map((row) => ({
    candidateId: text(row[1]),
    title: text(row[2]),
    description: text(row[3]),
    category: text(row[4]),
    mood: text(row[5]),
    priceUsd: number(row[6]),
    saleMode: text(row[7]),
    rightsApproved: boolean(row[8]),
    published: boolean(row[9]),
    decision: text(row[10]),
    technicalStatus: text(row[11]),
    width: number(row[13]),
    height: number(row[14]),
    sha256: text(row[15]),
    sourcePool: text(row[17]),
    privateBasePath: text(row[18]),
    displayPath: text(row[19]),
    alt: text(row[20]),
    slug: text(row[22]),
  }));
}

export function approvalDataRange(candidateCount) {
  if (!Number.isSafeInteger(candidateCount) || candidateCount < 1) {
    throw new Error("At least one curated candidate is required to build an approval workbook.");
  }
  return `A${APPROVAL_FIRST_DATA_ROW}:${APPROVAL_LAST_COLUMN}${APPROVAL_FIRST_DATA_ROW + candidateCount - 1}`;
}

export function approvalCommitDecision({ approvedCount, issueCount, requireLaunchCatalog }) {
  const launchCountValid = approvedCount >= 100 && approvedCount <= 200;
  const blockers = [
    ...(approvedCount === 0 ? ["EMPTY_APPROVAL_SET"] : []),
    ...(requireLaunchCatalog && !launchCountValid ? ["LAUNCH_COUNT_OUT_OF_RANGE"] : []),
  ];
  return {
    launchCountValid,
    blockers,
    canCommit: issueCount === 0 && blockers.length === 0,
  };
}

export function workbookCandidateIdentityMatches(approvalRows, candidates) {
  return approvalRows.length === candidates.length && approvalRows.every(
    (row, index) => row.candidateId !== "" && row.candidateId === candidates[index]?.id,
  );
}

export function candidateIdentityFingerprint(candidates) {
  const identities = candidates.map(({ id, sha256, sourcePool, privateBasePath, displayPath }) => ({
    id,
    sha256,
    sourcePool,
    privateBasePath,
    displayPath,
  }));
  return createHash("sha256").update(JSON.stringify(identities)).digest("hex");
}
