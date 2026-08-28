import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildCatalogImport } from "../../src/lib/artcovr/catalog-import.ts";
import { commitCatalogBatch } from "../../src/lib/artcovr/catalog-batch-transaction.ts";
import { decodeImageHeader, makeCatalogSlug } from "../../src/lib/artcovr/catalog-source.ts";

type PlanCandidate = {
  candidate: string;
  sourcePath: string;
  sourcePool: string;
  sha256: string;
  machineColorBlend: string;
  machineDominantColor: string;
  priceCents: number;
  currency: string;
};

type MetadataRow = {
  candidate: string;
  title: string;
  slug: string;
  description: string;
  alt: string;
  category: string;
  mood_1: string;
  mood_2: string;
  mood_3: string;
  keywords: string;
  price_usd: string;
  sale_mode: string;
  rights_approved: string;
  publication_approved: string;
};

const projectRoot = path.resolve(import.meta.dirname, "../..");
const batchRoot = path.join(projectRoot, "outputs", "catalog", "review-assets", "candidate-selection-2026-08-20");
const apply = process.argv.includes("--apply");
const allowedArguments = new Set(["--apply"]);
const unknownArguments = process.argv.slice(2).filter((argument) => !allowedArguments.has(argument));
if (unknownArguments.length > 0) throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}.`);

const planPath = path.join(batchRoot, "ARTCOVR_38_Approved_Priced_Intake.private.json");
const metadataPath = path.join(batchRoot, "ARTCOVR_38_Metadata_Proposals.csv");
const protectedDirectory = path.join(batchRoot, "protected-display-assets");
const approvedPath = path.join(projectRoot, "catalog", "approved-artworks.json");
const overridesPath = path.join(projectRoot, "catalog", "pricing-overrides.json");
const publicDirectory = path.join(projectRoot, "public", "assets", "artworks");

function parseCsv(input: string): Array<Record<string, string>> {
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      records.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (quoted) throw new Error("Metadata CSV ends inside a quoted field.");
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    records.push(row);
  }
  const [headers, ...data] = records;
  if (!headers) return [];
  return data.filter((values) => values.some(Boolean)).map((values) => {
    if (values.length !== headers.length) throw new Error("Metadata CSV row width does not match its header.");
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const words = (value: string) => value.split(";").map((entry) => entry.trim()).filter(Boolean);
const paletteValue = (value: string) => value.toLowerCase().replaceAll("__", " / ").replaceAll("_", " ");
const plan = JSON.parse(await readFile(planPath, "utf8")) as { approvedCount: number; candidates: PlanCandidate[] };
const metadataRows = parseCsv(await readFile(metadataPath, "utf8")) as MetadataRow[];
const approved = JSON.parse(await readFile(approvedPath, "utf8")) as Array<Record<string, unknown>>;
const overrides = JSON.parse(await readFile(overridesPath, "utf8")) as Record<string, unknown>;
if (plan.approvedCount !== 38 || plan.candidates.length !== 38 || metadataRows.length !== 38) {
  throw new Error("The owner-approved intake, metadata, and expected count must all equal 38.");
}

const metadataByCandidate = new Map(metadataRows.map((row) => [row.candidate, row]));
if (metadataByCandidate.size !== 38) throw new Error("Metadata candidate ids must be unique.");
const existingIds = new Set(approved.map((row) => String(row.id)));
const existingSlugs = new Set(approved.map((row) => String(row.slug)));
const existingHashes = new Set(approved.map((row) => String(row.sha256)));
const maxPosition = Math.max(...approved.map((row) => Number(row.position) || 0));
const additions: Array<Record<string, unknown>> = [];
const protectedAssets: Array<{ source: string; target: string }> = [];

for (const [index, candidate] of plan.candidates.entries()) {
  const metadata = metadataByCandidate.get(candidate.candidate);
  if (!metadata) throw new Error(`Missing metadata for candidate ${candidate.candidate}.`);
  if (metadata.rights_approved !== "yes" || metadata.publication_approved !== "yes") {
    throw new Error(`${candidate.candidate}: rights and publication approval must both be explicit.`);
  }
  if (metadata.sale_mode !== "repeatable" || candidate.currency !== "USD") {
    throw new Error(`${candidate.candidate}: this owner-approved batch must be repeatable USD.`);
  }
  if (Number(metadata.price_usd) * 100 !== candidate.priceCents) {
    throw new Error(`${candidate.candidate}: metadata and pricing plan disagree.`);
  }
  if (makeCatalogSlug(metadata.slug) !== metadata.slug) throw new Error(`${candidate.candidate}: slug is not canonical kebab-case.`);

  const sourceBytes = await readFile(candidate.sourcePath);
  const sourceHash = sha256(sourceBytes);
  if (sourceHash !== candidate.sha256) throw new Error(`${candidate.candidate}: private source SHA-256 mismatch.`);
  const sourceImage = decodeImageHeader(sourceBytes);
  if (sourceImage.width !== sourceImage.height || sourceImage.width < 1024) {
    throw new Error(`${candidate.candidate}: source must be a square image of at least 1024px.`);
  }
  const id = `art_${sourceHash.slice(0, 20)}`;
  if (existingIds.has(id) || existingSlugs.has(metadata.slug) || existingHashes.has(sourceHash)) {
    throw new Error(`${candidate.candidate}: id, slug, or source SHA already exists in the approved catalog.`);
  }
  const protectedSource = path.join(protectedDirectory, `${metadata.slug}.jpg`);
  const protectedBytes = await readFile(protectedSource);
  const protectedImage = decodeImageHeader(protectedBytes);
  if (protectedImage.format !== "jpeg" || protectedImage.width !== 1024 || protectedImage.height !== 1024) {
    throw new Error(`${candidate.candidate}: protected display must be a real 1024x1024 JPEG.`);
  }
  if (sha256(protectedBytes) === sourceHash) throw new Error(`${candidate.candidate}: protected display passthrough.`);

  const moods = [metadata.mood_1, metadata.mood_2, metadata.mood_3].map((value) => value.trim()).filter(Boolean);
  if (moods.length !== 3 || new Set(moods).size !== 3) throw new Error(`${candidate.candidate}: exactly three unique moods are required.`);
  const keywords = words(metadata.keywords);
  if (keywords.length < 4) throw new Error(`${candidate.candidate}: at least four editorial keywords are required.`);
  const searchText = [metadata.title, metadata.description, metadata.category, ...moods, ...keywords].join(" | ");
  const reviewFlags = candidate.candidate === "039"
    ? ["watermark_or_text"]
    : candidate.candidate === "058"
      ? ["identifiable_person"]
      : ["no_obvious_logo_text_watermark_likeness_or_protected_character_in_visual_review"];

  additions.push({
    id,
    position: maxPosition + index + 1,
    slug: metadata.slug,
    title: metadata.title,
    description: metadata.description,
    alt: metadata.alt,
    category: metadata.category,
    mood: moods.join(", "),
    moodTags: moods,
    reviewFlags,
    width: sourceImage.width,
    height: sourceImage.height,
    bytes: sourceBytes.length,
    sha256: sourceHash,
    sourcePool: candidate.sourcePool,
    sourceOrdinal: null,
    sourceMimeType: sourceImage.format === "png" ? "image/png" : "image/jpeg",
    sourcePrompt: null,
    privateBasePath: `artworks/${id}/base`,
    displayPath: `/assets/artworks/${metadata.slug}.jpg`,
    validationStatus: "technical-pass",
    validationIssues: [],
    rightsApproved: true,
    published: true,
    metadata: {
      styleId: null,
      styleFamily: metadata.category,
      keywords,
      avoids: [],
      palette: [candidate.machineDominantColor.toLowerCase(), paletteValue(candidate.machineColorBlend)],
      lighting: "",
      lineworkAndEdges: "",
      mediumAndTexture: "",
      compositionAndMotion: "",
      promptTemplates: {},
      qualityFlags: [],
      styleProfile: null,
      provenance: {
        confidence: {
          identity_dimensions_hash: "high",
          title_keywords: "owner-delegated editorial approval",
          prompt: "unavailable",
          rights: "owner_confirmed_2026-08-20",
        },
        linkage: {
          join: "recomputed SHA-256 of the private owner-selected source",
          source: candidate.sourcePool,
          classification: "owner_selected_expansion_2026-08-20",
          title_source: "owner-delegated ARTCOVR editorial review",
          keyword_source: "editorial visual review of the exact SHA-locked image",
          prompt_source: "unavailable; not reconstructed",
        },
        promptStatus: "unavailable; not reconstructed",
        provider: null,
        model: null,
      },
      searchText,
      searchVector: { status: "derived_on_database_import", type: "postgres_tsvector" },
      semanticEmbedding: { status: "not_generated", model: null, dimensions: null, vector: null },
    },
    saleMode: "repeatable",
    priceCents: candidate.priceCents,
    currency: "USD",
    tier: "archive",
  });
  protectedAssets.push({ source: protectedSource, target: path.join(publicDirectory, `${metadata.slug}.jpg`) });
}

const nextApproved = [...approved, ...additions];
const importBuild = buildCatalogImport(nextApproved);
const publishableApprovedCount = nextApproved.filter((row) => row.tier !== "delete").length;
if (importBuild.issues.length > 0 || importBuild.rows.length !== publishableApprovedCount) {
  throw new Error(`Canonical import validation failed: ${JSON.stringify(importBuild.issues)}`);
}
const nextOverrides = { ...overrides } as Record<string, unknown>;
for (const row of additions) {
  nextOverrides[String(row.slug)] = {
    saleMode: "repeatable",
    priceCents: row.priceCents,
    tier: "archive",
    rightsApproved: true,
  };
}

const prices = Object.fromEntries(
  [...new Set(additions.map((row) => Number(row.priceCents)))].sort((a, b) => a - b).map((price) => [
    `$${price / 100}`,
    additions.filter((row) => row.priceCents === price).length,
  ]),
);
const report = {
  mode: apply ? "apply" : "dry-run",
  decision: "owner-delegated rights, publication, repeatable sale mode, metadata, and pricing approval on 2026-08-20",
  approvedBefore: approved.length,
  approvedAfter: nextApproved.length,
  publishableBefore: approved.filter((row) => row.tier !== "delete").length,
  publishableAfter: nextApproved.filter((row) => row.tier !== "delete").length,
  added: additions.length,
  tier: "archive",
  saleMode: "repeatable",
  prices,
  homepageFeaturedSequenceChanged: false,
};

if (apply) {
  await commitCatalogBatch({
    replacements: [
      { target: approvedPath, contents: `${JSON.stringify(nextApproved, null, 2)}\n` },
      { target: overridesPath, contents: `${JSON.stringify(nextOverrides, null, 2)}\n` },
    ],
    assets: protectedAssets,
  });
}

console.log(JSON.stringify(report, null, 2));
