import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FileBlob, SpreadsheetFile } from "./artifact-tool-loader.mjs";

import { validateApprovalRows } from "../../src/lib/artcovr/catalog-approval.ts";
import {
  APPROVAL_HEADERS,
  APPROVAL_SHEET_NAME,
  approvalCommitDecision,
  candidateIdentityFingerprint,
  approvalDataRange,
  workbookValuesToApprovalRows,
  workbookCandidateIdentityMatches,
} from "./approval-workbook-schema.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const workbookPath = path.resolve(
  process.argv[2] ??
    path.join(projectRoot, "outputs", "catalog", "ARTCOVR_Catalog_Approval.xlsx"),
);
const requireLaunchCatalog = process.argv.includes("--launch");
const candidates = JSON.parse(
  await fs.readFile(path.join(projectRoot, "catalog", "curated-artworks.json"), "utf8"),
);
if (!Array.isArray(candidates) || candidates.length === 0) {
  throw new Error("At least one authoritative curated candidate is required.");
}
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const approvalSheet = workbook.worksheets.getItem(APPROVAL_SHEET_NAME);
const actualHeaders = approvalSheet.getRange("A8:X8").values[0]?.map((value) =>
  value === null || value === undefined ? "" : String(value).trim()
);
if (JSON.stringify(actualHeaders) !== JSON.stringify(APPROVAL_HEADERS)) {
  throw new Error("Approval workbook schema mismatch. Regenerate it from the current candidate set.");
}
const values = approvalSheet.getRange(approvalDataRange(candidates.length)).values;
const approvalRows = workbookValuesToApprovalRows(values);
if (!workbookCandidateIdentityMatches(approvalRows, candidates)) {
  throw new Error("Workbook candidate identities do not match the current authoritative set. Regenerate the workbook.");
}

const result = validateApprovalRows(approvalRows, candidates);
const report = {
  workbookPath,
  candidates: candidates.length,
  candidateIdentitySha256: candidateIdentityFingerprint(candidates),
  approved: result.approved.length,
  rejectedOrPending: candidates.length - result.approved.length,
  issues: result.issues,
};
const outputPath = path.join(projectRoot, "catalog", "approved-artworks.json");
const reportPath = path.join(projectRoot, "catalog", "approval-import-report.json");

const atomicWrite = async (targetPath, contents) => {
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
  try {
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
};

const decision = approvalCommitDecision({
  approvedCount: result.approved.length,
  issueCount: result.issues.length,
  requireLaunchCatalog,
});
const canCommit = decision.canCommit;
const finalReport = {
  ...report,
  launchCountValid: decision.launchCountValid,
  committed: canCommit,
  blockers: decision.blockers,
};
await atomicWrite(reportPath, `${JSON.stringify(finalReport, null, 2)}\n`);
if (canCommit) {
  await atomicWrite(outputPath, `${JSON.stringify(result.approved, null, 2)}\n`);
}

console.log(JSON.stringify({ ...finalReport, outputPath, reportPath }, null, 2));
if (!canCommit) {
  process.exitCode = 1;
}
