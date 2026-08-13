import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  decodeImageHeader,
  makeCatalogSlug,
  validateCandidateMetadata,
  type CandidateMetadata,
} from "../../src/lib/artcovr/catalog-source.ts";

type StyleManifestRow = {
  ordinal: number;
  style_id: string;
  name: string;
  primary_family: string;
  subject: string;
  prompt: string;
  status: string;
  local_image?: string;
  file_size?: number;
};

type CandidateRow = CandidateMetadata & {
  ordinal: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  mood: string;
  priceUsd: null;
  saleMode: null;
  rightsApproved: false;
  published: false;
  ownerDecision: "pending";
  sourceAbsolutePath: string;
  sourceFormat: "png" | "jpeg";
  sourceMimeType: "image/png" | "image/jpeg";
  privateBasePath: string;
  displayPath: string;
  alt: string;
  sourcePrompt: string;
  sourceManifest: string;
  validationStatus: "technical-pass" | "rejected";
  validationIssues: string[];
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const sourceRoot = process.env.ARTCOVR_SOURCE_ROOT
  ? path.resolve(process.env.ARTCOVR_SOURCE_ROOT)
  : "E:\\ART_COLLECTION\\generated_images";
const manifestPath = path.join(sourceRoot, "style_library_manifest.json");

function deterministicUuid(seed: string): string {
  const bytes = createHash("sha256").update(`ARTCOVR:${seed}`).digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as StyleManifestRow[];
const completed = manifest
  .filter((row) => row.status === "completed" && row.local_image)
  .sort((left, right) => left.ordinal - right.ordinal);

const slugCounts = new Map<string, number>();
const candidates: CandidateRow[] = [];

for (const row of completed) {
  const sourceAbsolutePath = path.join(sourceRoot, row.local_image!);
  const bytes = await readFile(sourceAbsolutePath);
  const header = decodeImageHeader(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const baseSlug = makeCatalogSlug(row.name || row.style_id) || `artwork-${row.ordinal}`;
  const seen = slugCounts.get(baseSlug) ?? 0;
  slugCounts.set(baseSlug, seen + 1);
  const slug = seen === 0 ? baseSlug : `${baseSlug}-${row.ordinal}`;
  const id = deterministicUuid(`${row.ordinal}:${row.style_id}:${sha256}`);
  const displayFilename = `${String(row.ordinal).padStart(3, "0")}-${slug}.jpg`;

  candidates.push({
    id,
    ordinal: row.ordinal,
    slug,
    title: row.name.trim(),
    description: row.subject.trim(),
    category: row.primary_family.trim(),
    mood: "",
    priceUsd: null,
    saleMode: null,
    rightsApproved: false,
    published: false,
    ownerDecision: "pending",
    width: header.width,
    height: header.height,
    bytes: bytes.byteLength,
    sha256,
    sourceAbsolutePath,
    sourceFormat: header.format,
    sourceMimeType: header.format === "png" ? "image/png" : "image/jpeg",
    privateBasePath: `source/${id}/original.${header.format === "png" ? "png" : "jpg"}`,
    displayPath: `/assets/artworks/${displayFilename}`,
    alt: row.subject.trim(),
    sourcePrompt: row.prompt.trim(),
    sourceManifest: manifestPath,
    validationStatus: "technical-pass",
    validationIssues: [],
  });
}

const issues = validateCandidateMetadata(candidates);
const issuesById = Map.groupBy(issues, (entry) => entry.id);
for (const candidate of candidates) {
  const candidateIssues = (issuesById.get(candidate.id) ?? []).map((entry) => entry.code);
  candidate.validationIssues = candidateIssues;
  candidate.validationStatus = candidateIssues.length === 0 ? "technical-pass" : "rejected";
}

const catalogDirectory = path.join(projectRoot, "catalog");
const jsonPath = path.join(catalogDirectory, "candidates.json");
const csvPath = path.join(catalogDirectory, "candidates.csv");
const headers: Array<keyof CandidateRow> = [
  "id",
  "ordinal",
  "slug",
  "title",
  "description",
  "category",
  "mood",
  "priceUsd",
  "saleMode",
  "rightsApproved",
  "published",
  "ownerDecision",
  "width",
  "height",
  "bytes",
  "sha256",
  "sourceAbsolutePath",
  "sourceFormat",
  "sourceMimeType",
  "privateBasePath",
  "displayPath",
  "alt",
  "sourcePrompt",
  "sourceManifest",
  "validationStatus",
  "validationIssues",
];
const csvRows = [
  headers.map(csvCell).join(","),
  ...candidates.map((candidate) =>
    headers
      .map((header) =>
        csvCell(
          header === "validationIssues"
            ? candidate.validationIssues.join("|")
            : candidate[header],
        ),
      )
      .join(","),
  ),
];

await writeFile(jsonPath, `${JSON.stringify(candidates, null, 2)}\n`, "utf8");
await writeFile(csvPath, `${csvRows.join("\r\n")}\r\n`, "utf8");

const rejected = candidates.filter((candidate) => candidate.validationStatus === "rejected");
console.log(
  JSON.stringify(
    {
      manifestPath,
      candidates: candidates.length,
      uniqueHashes: new Set(candidates.map((candidate) => candidate.sha256)).size,
      rejected: rejected.length,
      output: { jsonPath, csvPath },
    },
    null,
    2,
  ),
);

if (rejected.length > 0) {
  process.exitCode = 1;
}
