import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SpreadsheetFile, Workbook } from "./artifact-tool-loader.mjs";

import {
  APPROVAL_FIRST_DATA_ROW,
  APPROVAL_HEADERS,
  candidateToWorkbookRow,
} from "./approval-workbook-schema.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const outputDirectory = path.join(projectRoot, "outputs", "catalog");
const candidates = JSON.parse(
  await fs.readFile(path.join(projectRoot, "catalog", "curated-artworks.json"), "utf8"),
);

if (!Array.isArray(candidates) || candidates.length === 0) {
  throw new Error("At least one curated catalog candidate is required.");
}

await fs.mkdir(outputDirectory, { recursive: true });

const workbook = Workbook.create();
const readMe = workbook.worksheets.add("Read Me");
const approval = workbook.worksheets.add("Artwork Approval");
const lists = workbook.worksheets.add("Validation Lists");

const firstDataRow = APPROVAL_FIRST_DATA_ROW;
const lastDataRow = firstDataRow + candidates.length - 1;
const titleFill = "#0A0A0A";
const accent = "#D6FF3F";
const mutedFill = "#EFEFEA";
const editFill = "#FFF2B2";
const textDark = "#111111";

readMe.showGridLines = false;
readMe.mergeCells("A1:H2");
readMe.getRange("A1:H2").values = [["ARTCOVR · CATALOG APPROVAL"]];
readMe.getRange("A1:H2").format = {
  fill: titleFill,
  font: { bold: true, color: "#FFFFFF", size: 24 },
  verticalAlignment: "center",
};
readMe.mergeCells("A4:H4");
readMe.getRange("A4:H4").values = [[
  `${candidates.length} visually curated, technically valid owner-art candidates. Nothing is published until you explicitly approve rights, pricing, sale mode, and publication. Regenerate this workbook whenever the authoritative candidate set grows.`,
]];
readMe.getRange("A4:H4").format = {
  fill: mutedFill,
  font: { color: textDark, size: 11 },
  wrapText: true,
  verticalAlignment: "center",
};
readMe.getRange("A4:H4").format.rowHeight = 38;

readMe.getRange("A6:B10").values = [
  ["1", "Open Artwork Approval and review each watermarked preview."],
  ["2", "Edit the yellow fields: title, description, category, mood, price, sale mode, rights, publish, and decision."],
  ["3", "Set Rights approved to TRUE only after confirming commercial rights."],
  ["4", "Set Decision to approve and Publish to TRUE only for launch-ready artwork."],
  ["5", "Only rows marked READY pass the importer. Rejected and incomplete rows stay private."],
];
readMe.getRange("A6:A10").format = {
  fill: accent,
  font: { bold: true, color: textDark },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
readMe.getRange("B6:B10").format = {
  fill: "#FFFFFF",
  font: { color: textDark },
  wrapText: true,
  verticalAlignment: "center",
};
readMe.getRange("A6:B10").format.borders = {
  insideHorizontal: { style: "thin", color: "#D8D8D2" },
  outside: { style: "thin", color: "#B8B8B0" },
};
readMe.getRange("A6:B10").format.rowHeight = 34;

readMe.getRange("A13:H13").values = [[
  "TOTAL",
  "TECHNICAL PASS",
  "READY",
  "APPROVED",
  "REJECTED",
  "RIGHTS APPROVED",
  "PUBLISHED",
  "MISSING PRICE",
]];
readMe.getRange("A13:H13").format = {
  fill: titleFill,
  font: { bold: true, color: "#FFFFFF", size: 9 },
  horizontalAlignment: "center",
};
readMe.getRange("A14:H14").formulas = [[
  `=COUNTA('Artwork Approval'!B${firstDataRow}:B${lastDataRow})`,
  `=COUNTIF('Artwork Approval'!L${firstDataRow}:L${lastDataRow},"technical-pass")`,
  `=COUNTIF('Artwork Approval'!M${firstDataRow}:M${lastDataRow},"READY")`,
  `=COUNTIF('Artwork Approval'!K${firstDataRow}:K${lastDataRow},"approve")`,
  `=COUNTIF('Artwork Approval'!K${firstDataRow}:K${lastDataRow},"reject")`,
  `=COUNTIF('Artwork Approval'!I${firstDataRow}:I${lastDataRow},TRUE)`,
  `=COUNTIF('Artwork Approval'!J${firstDataRow}:J${lastDataRow},TRUE)`,
  `=COUNTBLANK('Artwork Approval'!G${firstDataRow}:G${lastDataRow})`,
]];
readMe.getRange("A14:H14").format = {
  fill: "#FFFFFF",
  font: { bold: true, color: textDark, size: 18 },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
readMe.getRange("A13:H14").format.borders = {
  insideVertical: { style: "thin", color: "#D8D8D2" },
  outside: { style: "medium", color: titleFill },
};
readMe.getRange("A14:H14").format.rowHeight = 38;
readMe.mergeCells("A17:H18");
readMe.getRange("A17:H18").values = [[
  "License gate: exclusive removes the artwork from ARTCOVR after verified purchase but does not transfer copyright or promise worldwide uniqueness. Repeatable allows multiple non-exclusive commercial licenses.",
]];
readMe.getRange("A17:H18").format = {
  fill: "#F8F8F5",
  font: { italic: true, color: "#3D3D38", size: 10 },
  wrapText: true,
  verticalAlignment: "center",
};
readMe.getRange("A1:H18").format.columnWidth = 16;
readMe.getRange("A:A").format.columnWidth = 7;
readMe.getRange("B:B").format.columnWidth = 58;
readMe.freezePanes.freezeRows(2);

approval.showGridLines = false;
approval.mergeCells("A1:X2");
approval.getRange("A1:X2").values = [["ARTCOVR · ARTWORK APPROVAL QUEUE"]];
approval.getRange("A1:X2").format = {
  fill: titleFill,
  font: { bold: true, color: "#FFFFFF", size: 22 },
  verticalAlignment: "center",
};
approval.mergeCells("A4:X5");
approval.getRange("A4:X5").values = [[
  "Yellow columns are owner-controlled. Technical pass means the source decoded successfully, is square, is at least 1024×1024, is nonzero, and has a unique SHA-256. READY is formula-driven and cannot be set manually.",
]];
approval.getRange("A4:X5").format = {
  fill: mutedFill,
  font: { color: textDark, size: 10 },
  wrapText: true,
  verticalAlignment: "center",
};
approval.getRange("A7:M7").values = [[
  "OWNER EDITS →",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "",
  "SYSTEM CHECKS →",
  "",
]];
approval.getRange("A7:K7").format = { fill: editFill, font: { bold: true, color: textDark } };
approval.getRange("L7:X7").format = { fill: "#DCE8F4", font: { bold: true, color: textDark } };

approval.getRange("A8:X8").values = [[...APPROVAL_HEADERS]];
approval.getRange("A8:X8").format = {
  fill: titleFill,
  font: { bold: true, color: "#FFFFFF", size: 9 },
  wrapText: true,
  verticalAlignment: "center",
};
approval.getRange("A8:X8").format.rowHeight = 34;

const rows = candidates.map(candidateToWorkbookRow);
approval.getRange(`A${firstDataRow}:X${lastDataRow}`).values = rows;
approval.getRange(`M${firstDataRow}`).formulas = [[
  `=IF(AND(K${firstDataRow}="approve",I${firstDataRow}=TRUE,J${firstDataRow}=TRUE,G${firstDataRow}>0,OR(H${firstDataRow}="exclusive",H${firstDataRow}="repeatable"),L${firstDataRow}="technical-pass",C${firstDataRow}<>"",D${firstDataRow}<>"",E${firstDataRow}<>"",F${firstDataRow}<>"",U${firstDataRow}<>""),"READY","BLOCKED")`,
]];
approval.getRange(`M${firstDataRow}:M${lastDataRow}`).fillDown();

approval.getRange(`C${firstDataRow}:K${lastDataRow}`).format.fill = editFill;
approval.getRange(`L${firstDataRow}:X${lastDataRow}`).format.fill = "#F5F8FB";
approval.getRange(`A${firstDataRow}:X${lastDataRow}`).format = {
  verticalAlignment: "center",
  font: { color: textDark, size: 9 },
};
approval.getRange(`A${firstDataRow}:X${lastDataRow}`).format.rowHeight = 78;
approval.getRange(`G${firstDataRow}:G${lastDataRow}`).format.numberFormat = "$#,##0.00";
approval.getRange(`N${firstDataRow}:O${lastDataRow}`).format.numberFormat = "0";
approval.getRange(`A8:X${lastDataRow}`).format.borders = {
  insideHorizontal: { style: "thin", color: "#DADAD5" },
  outside: { style: "medium", color: titleFill },
};

approval.getRange(`H${firstDataRow}:H${lastDataRow}`).dataValidation = {
  rule: { type: "list", values: ["exclusive", "repeatable"] },
};
approval.getRange(`I${firstDataRow}:J${lastDataRow}`).dataValidation = {
  rule: { type: "list", values: ["TRUE", "FALSE"] },
};
approval.getRange(`K${firstDataRow}:K${lastDataRow}`).dataValidation = {
  rule: { type: "list", values: ["pending", "approve", "reject"] },
};
approval.getRange(`G${firstDataRow}:G${lastDataRow}`).dataValidation = {
  rule: { type: "decimal", operator: "greaterThan", formula1: 0 },
};

approval.getRange(`M${firstDataRow}:M${lastDataRow}`).conditionalFormats.add(
  "containsText",
  { text: "READY", format: { fill: "#D9F6CE", font: { bold: true, color: "#155724" } } },
);
approval.getRange(`M${firstDataRow}:M${lastDataRow}`).conditionalFormats.add(
  "containsText",
  { text: "BLOCKED", format: { fill: "#F9DEDE", font: { color: "#812020" } } },
);
approval.getRange(`K${firstDataRow}:K${lastDataRow}`).conditionalFormats.add(
  "containsText",
  { text: "approve", format: { fill: "#D9F6CE", font: { bold: true, color: "#155724" } } },
);
approval.getRange(`K${firstDataRow}:K${lastDataRow}`).conditionalFormats.add(
  "containsText",
  { text: "reject", format: { fill: "#F9DEDE", font: { bold: true, color: "#812020" } } },
);

approval.getRange("A:A").format.columnWidth = 18;
approval.getRange("B:B").format.columnWidth = 38;
approval.getRange("C:C").format.columnWidth = 30;
approval.getRange("D:D").format.columnWidth = 52;
approval.getRange("E:F").format.columnWidth = 24;
approval.getRange("G:K").format.columnWidth = 15;
approval.getRange("L:M").format.columnWidth = 18;
approval.getRange("N:O").format.columnWidth = 10;
approval.getRange("P:P").format.columnWidth = 68;
approval.getRange("Q:Q").format.columnWidth = 14;
approval.getRange("R:T").format.columnWidth = 58;
approval.getRange("U:V").format.columnWidth = 62;
approval.getRange("W:W").format.columnWidth = 34;
approval.getRange("X:X").format.columnWidth = 28;
approval.freezePanes.freezeRows(8);
approval.freezePanes.freezeColumns(2);
const approvalTable = approval.tables.add(`B8:X${lastDataRow}`, true, "ArtworkApprovalTable");
approvalTable.style = "TableStyleMedium2";
approvalTable.showFilterButton = true;

for (let index = 0; index < candidates.length; index += 1) {
  const candidate = candidates[index];
  const thumbnailPath = path.join(
    projectRoot,
    "public",
    ...candidate.displayPath.split("/").filter(Boolean),
  );
  const thumbnail = await fs.readFile(thumbnailPath);
  approval.images.add({
    dataUrl: `data:image/jpeg;base64,${thumbnail.toString("base64")}`,
    anchor: {
      from: { row: firstDataRow - 1 + index, col: 0, rowOffsetPx: 3, colOffsetPx: 3 },
      extent: { widthPx: 72, heightPx: 72 },
    },
  });
}

lists.showGridLines = false;
lists.getRange("A1:D1").values = [["Sale modes", "Booleans", "Decisions", "Import states"]];
lists.getRange("A2:A3").values = [["exclusive"], ["repeatable"]];
lists.getRange("B2:B3").values = [["TRUE"], ["FALSE"]];
lists.getRange("C2:C4").values = [["pending"], ["approve"], ["reject"]];
lists.getRange("D2:D3").values = [["READY"], ["BLOCKED"]];
lists.getRange("A1:D1").format = { fill: titleFill, font: { bold: true, color: "#FFFFFF" } };
lists.getRange("A1:D4").format.columnWidth = 20;

const preview = await workbook.render({
  sheetName: "Read Me",
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  path.join(outputDirectory, "ARTCOVR_Catalog_Approval_preview.png"),
  new Uint8Array(await preview.arrayBuffer()),
);

for (const sheetName of ["Artwork Approval", "Validation Lists"]) {
  const sheetPreview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: sheetName === "Artwork Approval" ? 0.55 : 1,
    format: "png",
  });
  await fs.writeFile(
    path.join(outputDirectory, `ARTCOVR_Catalog_Approval_${sheetName.replaceAll(" ", "_")}.png`),
    new Uint8Array(await sheetPreview.arrayBuffer()),
  );
}
const approvalFocus = await workbook.render({
  sheetName: "Artwork Approval",
  range: "A1:M15",
  scale: 1,
  format: "png",
});
await fs.writeFile(
  path.join(outputDirectory, "ARTCOVR_Catalog_Approval_Artwork_Approval_focus.png"),
  new Uint8Array(await approvalFocus.arrayBuffer()),
);

const outputPath = path.join(outputDirectory, "ARTCOVR_Catalog_Approval.xlsx");
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputPath);

const inspect = await workbook.inspect({
  kind: "workbook,sheet,table,formula",
  maxChars: 8000,
  tableMaxRows: 4,
  tableMaxCols: 8,
  tableMaxCellChars: 80,
});
await fs.writeFile(
  path.join(outputDirectory, "ARTCOVR_Catalog_Approval_inspect.ndjson"),
  `${inspect.ndjson}\n`,
  "utf8",
);
const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
await fs.writeFile(
  path.join(outputDirectory, "ARTCOVR_Catalog_Approval_formula-errors.ndjson"),
  `${formulaErrors.ndjson}\n`,
  "utf8",
);

console.log(
  JSON.stringify(
    {
      candidates: candidates.length,
      outputPath,
      previewPath: path.join(outputDirectory, "ARTCOVR_Catalog_Approval_preview.png"),
      sheets: ["Read Me", "Artwork Approval", "Validation Lists"],
      rows: { firstDataRow, lastDataRow },
    },
    null,
    2,
  ),
);
