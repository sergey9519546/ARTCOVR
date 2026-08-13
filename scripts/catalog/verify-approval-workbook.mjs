import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { FileBlob, SpreadsheetFile } from "./artifact-tool-loader.mjs";

import {
  APPROVAL_FIRST_DATA_ROW,
  APPROVAL_HEADERS,
  APPROVAL_SHEET_NAME,
} from "./approval-workbook-schema.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const workbookPath = path.join(
  projectRoot,
  "outputs",
  "catalog",
  "ARTCOVR_Catalog_Approval.xlsx",
);

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(workbookPath));
const candidates = JSON.parse(
  await fs.readFile(path.join(projectRoot, "catalog", "curated-artworks.json"), "utf8"),
);
if (!Array.isArray(candidates) || candidates.length === 0) {
  throw new Error("At least one authoritative curated candidate is required.");
}
const approvalSheet = workbook.worksheets.getItem(APPROVAL_SHEET_NAME);
const tableNames = approvalSheet.tables.items.map((table) => table.name);
const lastDataRow = APPROVAL_FIRST_DATA_ROW + candidates.length - 1;
const headers = approvalSheet.getRange("A8:X8").values[0];
if (JSON.stringify(headers) !== JSON.stringify(APPROVAL_HEADERS)) {
  throw new Error("The exported approval workbook does not match the current schema.");
}
const readyValues = approvalSheet.getRange(`M${APPROVAL_FIRST_DATA_ROW}:M${lastDataRow}`).values.flat();
const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 7000,
  tableMaxRows: 4,
  tableMaxCols: 8,
  tableMaxCellChars: 80,
});
const formulas = await workbook.inspect({
  kind: "formula",
  sheetId: "Artwork Approval",
  range: `M${APPROVAL_FIRST_DATA_ROW}:M${lastDataRow}`,
  maxChars: 6000,
  options: { maxResults: 130 },
});
const combined = `${summary.ndjson}\n${formulas.ndjson}\n${JSON.stringify({ tableNames, readyValues })}`;
if (/#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A)/.test(combined)) {
  throw new Error("Formula error detected in the exported approval workbook.");
}
if (!tableNames.includes("ArtworkApprovalTable") || !combined.includes("Artwork Approval")) {
  throw new Error("Expected approval worksheet/table is missing after XLSX import.");
}

const verificationPath = path.join(
  projectRoot,
  "outputs",
  "catalog",
  "ARTCOVR_Catalog_Approval_reimport_inspect.ndjson",
);
await fs.writeFile(verificationPath, `${combined}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      workbookPath,
      verificationPath,
      formulaErrors: 0,
      requiredTablePresent: true,
      candidateRows: candidates.length,
    },
    null,
    2,
  ),
);
