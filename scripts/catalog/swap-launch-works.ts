/**
 * Owner-directed launch-catalog swap.
 *
 * Replaces a set of approved launch works with new, reference-led REGENERATED
 * ORIGINALS while preserving every catalog integrity invariant:
 *
 *  - the launch review set stays at exactly 100 index-parallel rows across
 *    catalog/curated-artworks.json, src/lib/artcovr/curated-review.json and
 *    src/lib/artcovr/launch-selection.ts;
 *  - each replacement inherits the removed work's `position`, `priceCents` and
 *    `saleMode`, so the approved price ladder and the exclusive/repeatable
 *    split are untouched (pricing provenance is flagged elsewhere; this script
 *    never invents a price);
 *  - identity is recomputed from the delivered file itself: full SHA-256,
 *    byte-detected format, decoded square dimensions and byte length;
 *  - metadata that has no trustworthy source stays an explicit null/empty
 *    value (prompt, avoids, palette, lighting, texture, linework, composition)
 *    with the lowest honest confidence labels, per catalog/README.md;
 *  - every removed work is written to catalog/excluded-candidates.json as an
 *    audit record instead of silently disappearing.
 *
 * The 100-slot ordering itself is owned by src/lib/artcovr/launch-selection.ts
 * (executable source, human-reviewed). This script never rewrites TypeScript:
 * it validates the JSON artifacts against the committed selection and fails
 * loudly if the two disagree.
 *
 * Usage:
 *   node --experimental-strip-types scripts/catalog/swap-launch-works.ts \
 *     --spec=catalog/swaps/<swap>.json [--apply]
 *
 * Without --apply the script is a dry run: it measures the sources, builds
 * every artifact in memory, validates, and reports what would change.
 * Display derivatives are encoded with Pillow (python3), matching the
 * baseline-JPEG quality-90 RGB convention of the existing review assets.
 */
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { buildCatalogImport } from "../../src/lib/artcovr/catalog-import.ts";
import { validateLaunchReviewIntegrity } from "../../src/lib/artcovr/catalog-review.ts";
import { decodeImageHeader } from "../../src/lib/artcovr/catalog-source.ts";
import { buildSearchText, launchSelection } from "../../src/lib/artcovr/launch-selection.ts";
import { candidateIdentityFingerprint } from "./approval-workbook-schema.mjs";

const execFileAsync = promisify(execFile);
// Windows installs the launcher as `python`; POSIX ships `python3`.
const pythonBin = process.platform === "win32" ? "python" : "python3";

type SwapWork = {
  replaces: string;
  sourceFile: string;
  /**
   * Schema v2. A single swap may draw from more than one owner-approved pool
   * and more than one container format. When present these override the
   * spec-level defaults; when absent the spec-level values apply, so every
   * v1 spec keeps its exact previous meaning.
   */
  sourcePool?: string;
  sourceMimeType?: "image/png" | "image/jpeg";
  sha256: string;
  slug: string;
  title: string;
  category: string;
  moodTags: string[];
  description: string;
  series: string;
};

type SwapSpec = {
  schemaVersion: number;
  swapId: string;
  date: string;
  directive: string;
  removalReason: string;
  sourcePool: string;
  sourceDirectory: string;
  sourceMimeType: "image/png" | "image/jpeg";
  reviewFlags: string[];
  provenanceNote: string;
  works: SwapWork[];
};

type JsonRecord = Record<string, unknown>;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const specArgument = args.find((argument) => argument.startsWith("--spec="));
const unknownArguments = args.filter(
  (argument) => argument !== "--apply" && !argument.startsWith("--spec="),
);
if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}. Use --spec=<path> [--apply].`);
}
if (!specArgument) throw new Error("A swap spec is required: --spec=catalog/swaps/<swap>.json");
const specPath = path.resolve(projectRoot, specArgument.slice("--spec=".length));

const curatedPath = path.join(projectRoot, "catalog", "curated-artworks.json");
const seedCuratedPath = path.join(projectRoot, "supabase", "seed", "artworks.curated.metadata.json");
const reviewPath = path.join(projectRoot, "src", "lib", "artcovr", "curated-review.json");
const approvedPath = path.join(projectRoot, "catalog", "approved-artworks.json");
const excludedPath = path.join(projectRoot, "catalog", "excluded-candidates.json");
const reportPath = path.join(projectRoot, "catalog", "approval-import-report.json");
const displayDirectory = path.join(projectRoot, "public", "assets", "artworks");

const readJson = async <T,>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

const spec = await readJson<SwapSpec>(specPath);
if (spec.schemaVersion !== 1 && spec.schemaVersion !== 2) {
  throw new Error(`Unsupported swap spec version: ${spec.schemaVersion}.`);
}
if (spec.schemaVersion === 1 && spec.works.some((work) => work.sourcePool ?? work.sourceMimeType)) {
  throw new Error("Per-work sourcePool/sourceMimeType requires schemaVersion 2.");
}

/** Per-work provenance, falling back to the spec-level default. */
const poolOf = (work: SwapWork): string => work.sourcePool ?? spec.sourcePool;
const mimeOf = (work: SwapWork): "image/png" | "image/jpeg" => work.sourceMimeType ?? spec.sourceMimeType;

const curated = await readJson<JsonRecord[]>(curatedPath);
const review = await readJson<JsonRecord[]>(reviewPath);
const approved = await readJson<JsonRecord[]>(approvedPath);
const excluded = await readJson<JsonRecord[]>(excludedPath);
const report = await readJson<JsonRecord>(reportPath);

const curatedBySlug = new Map(curated.map((record) => [String(record.slug), record]));
const approvedBySlug = new Map(approved.map((record) => [String(record.slug), record]));

/** Keywords are the owner's comma-separated visual-review descriptors, never inferred. */
const keywordsFrom = (description: string): string[] =>
  description
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

type MeasuredSource = {
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  format: "png" | "jpeg";
  absolutePath: string;
};

async function measureSource(work: SwapWork): Promise<MeasuredSource> {
  const absolutePath = path.resolve(spec.sourceDirectory, work.sourceFile);
  const contents = await readFile(absolutePath);
  const sha256 = createHash("sha256").update(contents).digest("hex");
  if (sha256 !== work.sha256) {
    throw new Error(`${work.sourceFile}: spec SHA-256 ${work.sha256} does not match the file (${sha256}).`);
  }
  // The delivered filename is the first 16 hex characters of the full digest.
  const namedPrefix = path.parse(work.sourceFile).name.toLowerCase();
  if (!sha256.startsWith(namedPrefix)) {
    throw new Error(`${work.sourceFile}: filename is not the SHA-256 prefix of its own bytes.`);
  }
  const header = decodeImageHeader(contents);
  if (header.width !== header.height || header.width < 1024) {
    throw new Error(`${work.sourceFile}: failed the square >=1024px technical gate.`);
  }
  const declaredMime = mimeOf(work);
  const expectedFormat = declaredMime === "image/png" ? "png" : "jpeg";
  if (header.format !== expectedFormat) {
    throw new Error(`${work.sourceFile}: byte-detected ${header.format} contradicts ${declaredMime}.`);
  }
  return { sha256, bytes: contents.byteLength, width: header.width, height: header.height, format: header.format, absolutePath };
}

/**
 * Baseline JPEG, quality 90, RGB, source dimensions preserved — identical in
 * kind to the derivatives produced by scripts/catalog/Prepare-DisplayAssets.ps1.
 * Clean sources never enter public/; only this lossy review derivative does.
 */
const encodeDisplayDerivative = `
import sys
from PIL import Image

source, target, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
with Image.open(source) as image:
    if image.size != (size, size):
        raise SystemExit(f"{source}: expected {size}x{size}, found {image.size[0]}x{image.size[1]}")
    rgb = image.convert("RGB")
    rgb.save(target, format="JPEG", quality=90, optimize=True, progressive=False, subsampling=0)
`;

const swapped: Array<{
  work: SwapWork;
  source: MeasuredSource;
  catalogId: string;
  position: number;
  priceCents: number;
  saleMode: string;
  removed: JsonRecord;
}> = [];

for (const work of spec.works) {
  const removedCurated = curatedBySlug.get(work.replaces);
  const removedApproved = approvedBySlug.get(work.replaces);
  if (!removedCurated || !removedApproved) {
    throw new Error(`Cannot replace ${work.replaces}: it is not in the current launch catalog.`);
  }
  const source = await measureSource(work);
  const catalogId = `art_${source.sha256.slice(0, 20)}`;
  swapped.push({
    work,
    source,
    catalogId,
    position: Number(removedCurated.position),
    priceCents: Number(removedApproved.priceCents),
    saleMode: String(removedApproved.saleMode),
    removed: removedCurated,
  });
}

const replacedSlugs = new Set(swapped.map(({ work }) => work.replaces));
const introducedHashes = new Set(swapped.map(({ source }) => source.sha256));
for (const record of curated) {
  if (replacedSlugs.has(String(record.slug))) continue;
  if (introducedHashes.has(String(record.sha256))) {
    throw new Error(`Regenerated source ${String(record.sha256)} already exists in the catalog.`);
  }
}

function curatedRecordFor(entry: (typeof swapped)[number]): JsonRecord {
  const { work, source, catalogId, position } = entry;
  const keywords = keywordsFrom(work.description);
  if (keywords.length === 0) throw new Error(`${work.slug}: description yields no review keywords.`);
  return {
    id: catalogId,
    position,
    slug: work.slug,
    title: work.title,
    description: work.description,
    alt: `${work.title}: ${work.description}.`,
    category: work.category,
    mood: work.moodTags.join(", "),
    moodTags: [...work.moodTags],
    reviewFlags: [...spec.reviewFlags],
    width: source.width,
    height: source.height,
    bytes: source.bytes,
    sha256: source.sha256,
    sourcePool: poolOf(work),
    sourceOrdinal: null,
    sourceMimeType: mimeOf(work),
    // No ledger-linked generation prompt exists for these works.
    sourcePrompt: null,
    privateBasePath: `artworks/${catalogId}/base`,
    displayPath: `/assets/artworks/${work.slug}.jpg`,
    validationStatus: "technical-pass",
    validationIssues: [],
    rightsApproved: false,
    published: false,
    metadata: {
      styleId: null,
      styleFamily: work.category,
      keywords,
      // Explicit empties: no trustworthy source metadata exists for these
      // fields, and catalog/README.md forbids guessing them.
      avoids: [],
      palette: [],
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
          title_keywords: "medium: owner-authored labels from the regeneration brief; no source-metadata join",
          prompt: "unavailable",
          rights: "unverified",
        },
        linkage: {
          join: "recomputed SHA-256 of the delivered regeneration output",
          source: poolOf(work),
          classification: "regenerated_original",
          reference_series: work.series,
          title_source: "owner regeneration brief",
          keyword_source: "curator visual review of the exact SHA-locked image",
          prompt_source: "unavailable; original brief held outside this repository and not ledger-linked",
        },
        promptStatus: "unavailable; not reconstructed",
        provider: null,
        model: null,
      },
      searchText: buildSearchText({
        title: work.title,
        description: work.description,
        category: work.category,
        moodTags: work.moodTags,
        keywords,
        palette: [],
        lighting: "",
        mediumAndTexture: "",
      }),
      searchVector: { status: "derived_on_database_import", type: "postgres_tsvector" },
      semanticEmbedding: { status: "not_generated", model: null, dimensions: null, vector: null },
    },
  };
}

const reviewRecordFor = (record: JsonRecord): JsonRecord => ({
  id: record.id,
  slug: record.slug,
  title: record.title,
  image: record.displayPath,
  alt: record.alt,
  description: record.description,
  category: record.category,
  moodTags: record.moodTags,
  editionAvailable: null,
  editionTotal: null,
  licenseLabel: null,
  saleMode: null,
  priceCents: null,
  rightsApproved: false,
  published: false,
  accentColor: "#0b0b0b",
});

const approvedRecordFor = (record: JsonRecord, entry: (typeof swapped)[number]): JsonRecord => ({
  ...record,
  rightsApproved: true,
  published: true,
  // Inherited from the replaced work: the ladder and the sale-mode split are
  // owner decisions this script must preserve, never recompute.
  saleMode: entry.saleMode,
  priceCents: entry.priceCents,
  currency: "USD",
});

const nextCurated = [...curated];
const nextReview = [...review];
const nextApproved = [...approved];
for (const entry of swapped) {
  const index = nextCurated.findIndex((record) => record.slug === entry.work.replaces);
  const approvedIndex = nextApproved.findIndex((record) => record.slug === entry.work.replaces);
  const reviewIndex = nextReview.findIndex((record) => record.slug === entry.work.replaces);
  if (index < 0 || approvedIndex < 0 || reviewIndex < 0) {
    throw new Error(`${entry.work.replaces} is missing from one of the catalog artifacts.`);
  }
  const record = curatedRecordFor(entry);
  nextCurated[index] = record;
  nextReview[reviewIndex] = reviewRecordFor(record);
  nextApproved[approvedIndex] = approvedRecordFor(record, entry);
}

const auditRecords = swapped.map(({ removed }) => ({
  id: removed.id,
  sourcePool: removed.sourcePool,
  ordinal: removed.sourceOrdinal,
  slug: removed.slug,
  title: removed.title,
  sha256: removed.sha256,
  reason: spec.removalReason,
}));
const alreadyAudited = new Set(
  excluded.map((record) => `${String(record.sha256)}:${String(record.reason)}`),
);
const nextExcluded = [
  ...excluded,
  ...auditRecords.filter((record) => !alreadyAudited.has(`${record.sha256}:${record.reason}`)),
];

const nextReport = {
  ...report,
  candidates: nextCurated.length,
  candidateIdentitySha256: candidateIdentityFingerprint(nextCurated),
  rejectedOrPending: nextCurated.length - Number(report.approved ?? 0),
  source: spec.provenanceNote,
};

// ---------------------------------------------------------------------------
// Integrity gates. Everything below must hold before a single byte is written.
// ---------------------------------------------------------------------------
const failures: string[] = [];
const integrityIssues = validateLaunchReviewIntegrity({
  candidates: nextCurated,
  review: nextReview,
  selection: launchSelection,
});
if (integrityIssues.length > 0) {
  failures.push(
    `launch review integrity: ${integrityIssues.join(", ")} (is src/lib/artcovr/launch-selection.ts updated for this swap?)`,
  );
}
const importBuild = buildCatalogImport(nextApproved);
if (importBuild.issues.length > 0) {
  failures.push(`approved catalog import: ${importBuild.issues.map(({ code }) => code).join(", ")}`);
}
if (nextCurated.length !== 100 || nextReview.length !== 100 || nextApproved.length !== 100) {
  failures.push("the launch catalog must remain exactly 100 rows");
}
const positionsMatch = nextCurated.every(
  (record, index) => record.position === index + 1 && nextApproved[index]?.slug === record.slug,
);
if (!positionsMatch) failures.push("curated and approved rows lost position parity");
// A swap must never move a price. Each replacement inherits the removed work's
// priceCents, so the correct invariant is that the ladder is byte-for-byte the
// same before and after -- which also holds for a no-op swap. (The previous
// "strictly ascending" test did not describe this catalog: the committed ladder
// descends from 20000 to 1000 with ties, so it rejected every swap, including
// one that changed nothing.)
const priceLadderBefore = approved.map((record) => Number(record.priceCents));
const priceLadderAfter = nextApproved.map((record) => Number(record.priceCents));
if (
  priceLadderBefore.length !== priceLadderAfter.length ||
  priceLadderAfter.some((price, index) => price !== priceLadderBefore[index])
) {
  failures.push("the approved price ladder changed");
}
const saleModes = nextApproved.filter((record) => record.saleMode === "exclusive").length;
if (saleModes !== approved.filter((record) => record.saleMode === "exclusive").length) {
  failures.push("the exclusive/repeatable split changed");
}
if (failures.length > 0) throw new Error(`Swap rejected:\n - ${failures.join("\n - ")}`);

/**
 * These artifacts are maintained from a Windows workstation and are committed
 * with CRLF endings. A swap changes eight rows, so it must not also rewrite
 * every other line: preserve whatever ending the file already uses and keep
 * the audit diff readable.
 */
const matchExistingLineEndings = async (targetPath: string, contents: string): Promise<string> => {
  const existing = await readFile(targetPath, "utf8").catch(() => "");
  return existing.includes("\r\n") ? contents.replaceAll("\n", "\r\n") : contents;
};

const writeAtomic = async (targetPath: string, rawContents: string) => {
  const contents = await matchExistingLineEndings(targetPath, rawContents);
  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
};

const serialized = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

if (apply) {
  const curatedJson = serialized(nextCurated);
  // catalog/curated-artworks.json and the Supabase seed copy are byte-identical
  // by contract; a drift test enforces it.
  await writeAtomic(curatedPath, curatedJson);
  await writeAtomic(seedCuratedPath, curatedJson);
  await writeAtomic(reviewPath, serialized(nextReview));
  await writeAtomic(approvedPath, serialized(nextApproved));
  await writeAtomic(excludedPath, serialized(nextExcluded));
  await writeAtomic(reportPath, serialized(nextReport));

  for (const entry of swapped) {
    const removedDisplay = path.join(
      displayDirectory,
      path.posix.basename(String(entry.removed.displayPath)),
    );
    await rm(removedDisplay, { force: true });
    const target = path.join(displayDirectory, `${entry.work.slug}.jpg`);
    await execFileAsync(pythonBin, [
      "-c",
      encodeDisplayDerivative,
      entry.source.absolutePath,
      target,
      String(entry.source.width),
    ]);
    const written = await readFile(target);
    const header = decodeImageHeader(written);
    if (
      header.format !== "jpeg" ||
      header.width !== entry.source.width ||
      header.height !== entry.source.height
    ) {
      throw new Error(`${entry.work.slug}.jpg is not a square JPEG derivative of its source.`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      swapId: spec.swapId,
      sourcePool: spec.sourcePool,
      replaced: swapped.map(({ work, source, catalogId, position, priceCents, saleMode }) => ({
        position,
        removedSlug: work.replaces,
        addedSlug: work.slug,
        catalogId,
        sha256: source.sha256,
        bytes: source.bytes,
        dimensions: `${source.width}x${source.height}`,
        priceCents,
        saleMode,
        series: work.series,
      })),
      curatedRows: nextCurated.length,
      approvedRows: nextApproved.length,
      auditRecordsAppended: nextExcluded.length - excluded.length,
      candidateIdentitySha256: nextReport.candidateIdentitySha256,
      approvedCatalogSha256: importBuild.sourceSha256,
      launchReviewIntegrityIssues: 0,
      nextStep: apply ? "npm run catalog:project" : "re-run with --apply",
    },
    null,
    2,
  ),
);
