export type ApprovalCandidate = {
  id: string;
  slug: string;
  width: number;
  height: number;
  sha256: string;
  sourcePool: string;
  privateBasePath: string;
  displayPath: string;
  validationStatus: "technical-pass" | "rejected";
};

export type ApprovalRow = {
  candidateId: string;
  title: string;
  description: string;
  category: string;
  mood: string;
  priceUsd: number;
  saleMode: "exclusive" | "repeatable" | "";
  rightsApproved: boolean;
  published: boolean;
  decision: "pending" | "approve" | "reject";
  technicalStatus: string;
  width: number;
  height: number;
  sha256: string;
  sourcePool: string;
  privateBasePath: string;
  displayPath: string;
  alt: string;
  slug: string;
};

export type ApprovalIssueCode =
  | "UNKNOWN_CANDIDATE"
  | "DUPLICATE_CANDIDATE"
  | "SOURCE_MISMATCH"
  | "MISSING_TITLE"
  | "MISSING_DESCRIPTION"
  | "MISSING_CATEGORY"
  | "MISSING_MOOD"
  | "MISSING_ALT"
  | "INVALID_PRICE"
  | "INVALID_SALE_MODE"
  | "RIGHTS_NOT_APPROVED"
  | "NOT_PUBLISHED";

export type ApprovalIssue = {
  candidateId: string;
  code: ApprovalIssueCode;
};

export type ImportReadyArtwork = ApprovalCandidate & {
  title: string;
  description: string;
  category: string;
  mood: string;
  priceCents: number;
  currency: "USD";
  saleMode: "exclusive" | "repeatable";
  rightsApproved: true;
  published: true;
  alt: string;
};

const clean = (value: string): string => value.trim();

export function validateApprovalRows(
  rows: ApprovalRow[],
  candidates: ApprovalCandidate[],
): { approved: ImportReadyArtwork[]; issues: ApprovalIssue[] } {
  const approved: ImportReadyArtwork[] = [];
  const issues: ApprovalIssue[] = [];
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const approvedIds = new Set<string>();

  for (const row of rows) {
    if (row.decision !== "approve") continue;

    const rowIssues: ApprovalIssue[] = [];
    const candidate = candidatesById.get(row.candidateId);
    if (!candidate) {
      issues.push({ candidateId: row.candidateId, code: "UNKNOWN_CANDIDATE" });
      continue;
    }
    if (approvedIds.has(row.candidateId)) {
      issues.push({ candidateId: row.candidateId, code: "DUPLICATE_CANDIDATE" });
      continue;
    }
    approvedIds.add(row.candidateId);

    const sourceMatches =
      row.technicalStatus === "technical-pass" &&
      candidate.validationStatus === "technical-pass" &&
      row.slug === candidate.slug &&
      row.width === candidate.width &&
      row.height === candidate.height &&
      row.sha256.toLowerCase() === candidate.sha256.toLowerCase() &&
      row.sourcePool === candidate.sourcePool &&
      row.privateBasePath === candidate.privateBasePath &&
      row.displayPath === candidate.displayPath;
    if (!sourceMatches) {
      issues.push({ candidateId: row.candidateId, code: "SOURCE_MISMATCH" });
      continue;
    }

    if (!clean(row.title)) rowIssues.push({ candidateId: row.candidateId, code: "MISSING_TITLE" });
    if (!clean(row.description)) rowIssues.push({ candidateId: row.candidateId, code: "MISSING_DESCRIPTION" });
    if (!clean(row.category)) rowIssues.push({ candidateId: row.candidateId, code: "MISSING_CATEGORY" });
    if (!clean(row.mood)) rowIssues.push({ candidateId: row.candidateId, code: "MISSING_MOOD" });
    if (!clean(row.alt)) rowIssues.push({ candidateId: row.candidateId, code: "MISSING_ALT" });

    const priceCents = Math.round(row.priceUsd * 100);
    if (
      !Number.isFinite(row.priceUsd) ||
      row.priceUsd <= 0 ||
      !Number.isSafeInteger(priceCents) ||
      Math.abs(row.priceUsd * 100 - priceCents) > 1e-6
    ) {
      rowIssues.push({ candidateId: row.candidateId, code: "INVALID_PRICE" });
    }
    if (row.saleMode !== "exclusive" && row.saleMode !== "repeatable") {
      rowIssues.push({ candidateId: row.candidateId, code: "INVALID_SALE_MODE" });
    }
    if (!row.rightsApproved) {
      rowIssues.push({ candidateId: row.candidateId, code: "RIGHTS_NOT_APPROVED" });
    }
    if (!row.published) {
      rowIssues.push({ candidateId: row.candidateId, code: "NOT_PUBLISHED" });
    }

    issues.push(...rowIssues);
    if (rowIssues.length > 0) continue;

    approved.push({
      ...candidate,
      title: clean(row.title),
      description: clean(row.description),
      category: clean(row.category),
      mood: clean(row.mood),
      priceCents,
      currency: "USD",
      saleMode: row.saleMode as "exclusive" | "repeatable",
      rightsApproved: true,
      published: true,
      alt: clean(row.alt),
    });
  }

  return { approved, issues };
}
