import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  APPROVAL_HEADERS,
  candidateToWorkbookRow,
  workbookValuesToApprovalRows,
} from "../../scripts/catalog/approval-workbook-schema.mjs";

let artifactTool = null;
try {
  artifactTool = await import("../../scripts/catalog/artifact-tool-loader.mjs");
} catch {
  // The storefront intentionally does not ship the Codex spreadsheet runtime.
}

test("XLSX export/import preserves the approval schema and R/S identity columns", {
  skip: artifactTool === null ? "bundled Codex spreadsheet runtime unavailable" : false,
}, async () => {
  const { FileBlob, SpreadsheetFile, Workbook } = artifactTool;
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "artcovr-workbook-roundtrip-"));
  const workbookPath = path.join(temporaryDirectory, "roundtrip.xlsx");
  try {
    const candidate = {
      id: `art_${"a".repeat(20)}`,
      slug: "copper-sky",
      title: "Copper Sky",
      description: "A copper cloud over a black sea.",
      category: "Surreal",
      mood: "luminous",
      width: 2048,
      height: 2048,
      sha256: "a".repeat(64),
      sourceMimeType: "image/png",
      sourcePool: "generated_images",
      privateBasePath: `artworks/art_${"a".repeat(20)}/base`,
      displayPath: "/assets/artworks/copper-sky.jpg",
      alt: "A copper cloud floating over a black sea",
      sourcePrompt: "A copper cloud over a black sea.",
      validationStatus: "technical-pass",
      validationIssues: [],
      reviewFlags: [],
    };
    const row = candidateToWorkbookRow(candidate);
    row[6] = 19.99;
    row[7] = "repeatable";
    row[8] = true;
    row[9] = true;
    row[10] = "approve";

    const workbook = Workbook.create();
    const sheet = workbook.worksheets.add("Artwork Approval");
    sheet.getRange("A8:X8").values = [[...APPROVAL_HEADERS]];
    sheet.getRange("A9:X9").values = [row];
    const exported = await SpreadsheetFile.exportXlsx(workbook);
    await exported.save(workbookPath);

    const imported = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
    const importedSheet = imported.worksheets.getItem("Artwork Approval");
    assert.deepEqual(importedSheet.getRange("A8:X8").values[0], APPROVAL_HEADERS);
    const [approval] = workbookValuesToApprovalRows(importedSheet.getRange("A9:X9").values);
    assert.equal(approval.sourcePool, "generated_images");
    assert.equal(approval.privateBasePath, candidate.privateBasePath);
    assert.equal(approval.priceUsd, 19.99);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
