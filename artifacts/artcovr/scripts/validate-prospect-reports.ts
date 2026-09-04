import fs from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;
type CsvRecord = Record<string, string>;

const reportsDir = path.resolve("reports");
const csvPath = path.join(reportsDir, "artcovr-prospect-list.csv");
const jsonPath = path.join(reportsDir, "prospect-research.json");

const sharedFields = [
  ["Company / Artist", "company_or_artist"],
  ["Domain", "domain"],
  ["Segment", "segment"],
  ["Location", "location"],
  ["Fit Score (1-5)", "fit_score_1_to_5"],
  ["Tier", "tier"],
  ["Trigger", "trigger"],
  ["Trigger Date", "trigger_date"],
  ["Target Contact Role", "likely_buyer_title"],
  ["LinkedIn URL", "linkedin_url"],
  ["Email", "email"],
  ["Evidence URL", "evidence_url"],
  ["Evidence Summary", "evidence_summary"],
  ["Research Angle", "research_angle"],
  ["Verification Status", "verification_status"],
  ["Verified On", "verified_on"],
  ["Current Release or Campaign Signal", "current_release_or_campaign_signal"],
  ["Release / Campaign Date", "release_campaign_date"],
  ["Release Verification URL", "release_verification_url"],
  ["Decision-Maker", "decision_maker"],
  ["Decision-Maker Role", "decision_maker_role"],
  ["Decision-Maker Source URL", "decision_maker_source_url"],
  ["Verification Notes", "verification_notes"],
] as const;

function parseCsv(text: string): { headers: string[]; rows: CsvRecord[] } {
  const cells: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field);
      cells.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  if (inQuotes) {
    throw new Error("CSV contains an unterminated quoted field");
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    cells.push(row);
  }

  const [headers = [], ...data] = cells;
  const rows: CsvRecord[] = [];
  for (const [rowIndex, values] of data.entries()) {
    if (values.length !== headers.length) {
      throw new Error(
        `CSV row ${rowIndex + 2} has ${values.length} columns; expected ${headers.length}`,
      );
    }
    rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index]])));
  }

  return { headers, rows };
}

function comparable(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function indexByName<T extends Record<string, unknown>>(
  records: T[],
  field: string,
  label: string,
  errors: string[],
): Map<string, T> {
  const index = new Map<string, T>();
  for (const [recordIndex, record] of records.entries()) {
    const name = comparable(record[field]);
    if (!name) {
      errors.push(`${label} record ${recordIndex + 1} has no company_or_artist value`);
    } else if (index.has(name)) {
      errors.push(`${label} contains duplicate prospect "${name}"`);
    } else {
      index.set(name, record);
    }
  }
  return index;
}

function main() {
  const errors: string[] = [];
  const json = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as unknown;
  if (!Array.isArray(json)) {
    throw new Error("prospect-research.json must contain an array");
  }

  const { headers, rows } = parseCsv(fs.readFileSync(csvPath, "utf8"));
  for (const [csvField] of sharedFields) {
    if (!headers.includes(csvField)) {
      errors.push(`CSV is missing shared field "${csvField}"`);
    }
  }

  const jsonRecords = json.filter(
    (record): record is JsonRecord => typeof record === "object" && record !== null,
  );
  if (jsonRecords.length !== json.length) {
    errors.push("prospect-research.json contains a non-object record");
  }

  const jsonByName = indexByName(jsonRecords, "company_or_artist", "JSON", errors);
  const csvByName = indexByName(
    rows as Array<Record<string, unknown>>,
    "Company / Artist",
    "CSV",
    errors,
  );

  const jsonNames = new Set(jsonByName.keys());
  const csvNames = new Set(csvByName.keys());
  for (const name of jsonNames) {
    if (!csvNames.has(name)) {
      errors.push(`Missing from CSV: "${name}"`);
    }
  }
  for (const name of csvNames) {
    if (!jsonNames.has(name)) {
      errors.push(`Missing from JSON: "${name}"`);
    }
  }

  for (const name of jsonNames) {
    const jsonRecord = jsonByName.get(name);
    const csvRecord = csvByName.get(name);
    if (!jsonRecord || !csvRecord) continue;

    for (const [csvField, jsonField] of sharedFields) {
      const csvValue = comparable(csvRecord[csvField]);
      const jsonValue = comparable(jsonRecord[jsonField]);
      if (csvValue !== jsonValue) {
        errors.push(
          `"${name}" ${csvField} differs: CSV=${JSON.stringify(csvValue)} JSON=${JSON.stringify(jsonValue)}`,
        );
      }
    }
  }

  if (errors.length > 0) {
    console.error(`Prospect report validation failed with ${errors.length} issue(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Prospect reports synchronized: ${jsonByName.size} unique records`);
}

main();