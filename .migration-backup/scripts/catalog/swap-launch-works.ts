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
 *    with the lowest honest confidence labels, per catalog/README.md, and
 *    provenance is derived from the row's real source pool rather than stamped
 *    from a template;
 *  - a new SHA-256 NEVER acquires rights or publication here. Replacement rows
 *    land `rightsApproved: false, published: false` and must go through
 *    scripts/catalog/import-approval-workbook.mjs, the only path with a real
 *    `decision === "approve"` gate. Because the approved catalog projection
 *    rejects unapproved rows, a swap fails loudly until that has happened;
 *  - a source on the launch blocklist (hardcoded rejects, regeneration-only
 *    identities, and every owner exclusion in catalog/excluded-candidates.json)
 *    is refused at selection time;
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
import {
  BLOCKED_LAUNCH_SOURCE_HASHES,
  isBlockedLaunchSource,
  validateLaunchReviewIntegrity,
} from "../../src/lib/artcovr/catalog-review.ts";
import { decodeImageHeader } from "../../src/lib/artcovr/catalog-source.ts";
import { PUBLIC_DISPLAY_MAX_DIMENSION } from "./display-contract.ts";
import type { DirectSourcePool } from "../../src/lib/artcovr/launch-selection.ts";
import {
  LAUNCH_SOURCE_POOLS,
  buildSearchText,
  launchSelection,
} from "../../src/lib/artcovr/launch-selection.ts";
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
// `!== undefined` and not a nullish/truthy test: an empty-string sourcePool is
// still a per-work override, and it must not slip past the schemaVersion gate
// only to be silently replaced by the spec-level default further down.
if (
  spec.schemaVersion === 1 &&
  spec.works.some((work) => work.sourcePool !== undefined || work.sourceMimeType !== undefined)
) {
  throw new Error("Per-work sourcePool/sourceMimeType requires schemaVersion 2.");
}

const APPROVED_SOURCE_POOLS = new Set<string>(LAUNCH_SOURCE_POOLS);

/**
 * Per-work source pool, falling back to the spec-level default, validated
 * rather than merely defaulted: an empty or unknown pool is a spec error, not
 * a reason to quietly adopt the spec default.
 */
const poolOf = (work: SwapWork): DirectSourcePool => {
  const pool = work.sourcePool ?? spec.sourcePool;
  if (typeof pool !== "string" || pool.trim().length === 0) {
    throw new Error(`${work.slug}: sourcePool is missing or empty at both the work and spec level.`);
  }
  if (!APPROVED_SOURCE_POOLS.has(pool)) {
    throw new Error(
      `${work.slug}: '${pool}' is not an owner-approved source pool (${[...APPROVED_SOURCE_POOLS].join(", ")}).`,
    );
  }
  return pool as DirectSourcePool;
};

const mimeOf = (work: SwapWork): "image/png" | "image/jpeg" => {
  const mime = work.sourceMimeType ?? spec.sourceMimeType;
  if (mime !== "image/png" && mime !== "image/jpeg") {
    throw new Error(`${work.slug}: sourceMimeType must be image/png or image/jpeg, got ${JSON.stringify(mime)}.`);
  }
  return mime;
};

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
 * Baseline JPEG, quality 90, RGB, downscaled to `size` — the same contract as
 * scripts/catalog/Prepare-DisplayAssets.ps1, which renders at the ceiling.
 * Clean sources never enter public/; only this lossy review derivative does.
 *
 * This previously preserved source dimensions and asserted `image.size ==
 * (size, size)` while the caller passed the source's own width, making the
 * assertion vacuous and emitting previews at full master resolution. Never
 * upscales: a source below the ceiling keeps its own size.
 */
const encodeDisplayDerivative = `
import sys
from PIL import Image

source, target, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
with Image.open(source) as image:
    if image.size[0] != image.size[1]:
        raise SystemExit(f"{source}: expected a square image, found {image.size[0]}x{image.size[1]}")
    if image.size[0] < size:
        raise SystemExit(f"{source}: refusing to upscale {image.size[0]}px to {size}px")
    rgb = image.convert("RGB")
    if image.size[0] != size:
        rgb = rgb.resize((size, size), Image.LANCZOS)
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
  // Rejected at selection time, not merely warned about: the blocklist covers
  // hardcoded visible-text rejects, regeneration-only identities, and every
  // SHA-256 the owner removed in catalog/excluded-candidates.json. A swap may
  // not bring one back under a new slug.
  if (isBlockedLaunchSource(source.sha256)) {
    throw new Error(
      `${work.slug}: source ${source.sha256} is on the launch blocklist ` +
        `(${BLOCKED_LAUNCH_SOURCE_HASHES.size} retired identities; see catalog/excluded-candidates.json ` +
        `and src/lib/artcovr/catalog-review.ts). It can never re-enter the launch catalog.`,
    );
  }
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

/**
 * Provenance is a claim about where a row's bytes and its labels came from, so
 * it is derived from the row's real source pool — never stamped from a single
 * hardcoded template.
 *
 * Only `regenerated_originals` has a provenance this script can establish from
 * the data it holds: the delivered file IS the new work, so the join is the
 * recomputed SHA-256 of that file, the classification is `regenerated_original`
 * and the title comes from the owner's regeneration brief.
 *
 * The direct-use pools are different in kind. A `concept_reference_art` row
 * joins to its pool through the audit index and carries a per-row
 * classification (`other`, `neo_gekiga`, ...); a `generated_images` row joins
 * through its ordinal, style-profile path and manifest. A swap spec carries
 * none of that, and catalog/README.md forbids guessing metadata, so those pools
 * are rejected here instead of being described with another pool's shape.
 */
function provenanceFor(entry: (typeof swapped)[number]): JsonRecord {
  const { work } = entry;
  const pool = poolOf(work);
  if (pool !== "regenerated_originals") {
    throw new Error(
      `${work.slug}: cannot establish provenance for sourcePool '${pool}'. This script can only ` +
        `describe 'regenerated_originals', whose provenance is the recomputed SHA-256 of the ` +
        `delivered output. A '${pool}' row joins to its pool through an audit index, ordinal or ` +
        `style-profile manifest that this swap spec does not carry, and catalog/README.md forbids ` +
        `guessing metadata. Stamping 'regenerated_original' on it would record false provenance.`,
    );
  }
  const series = typeof work.series === "string" ? work.series.trim() : "";
  if (series.length === 0) {
    throw new Error(`${work.slug}: a regenerated original must name the regeneration-brief series.`);
  }
  return {
    confidence: {
      identity_dimensions_hash: "high",
      title_keywords:
        "medium: owner-authored labels from the regeneration brief; no source-metadata join",
      prompt: "unavailable",
      rights: "unverified",
    },
    linkage: {
      join: "recomputed SHA-256 of the delivered regeneration output",
      source: pool,
      classification: "regenerated_original",
      reference_series: series,
      title_source: "owner regeneration brief",
      keyword_source: "curator visual review of the exact SHA-locked image",
      prompt_source:
        "unavailable; original brief held outside this repository and not ledger-linked",
    },
    promptStatus: "unavailable; not reconstructed",
    provider: null,
    model: null,
  };
}

function curatedRecordFor(entry: (typeof swapped)[number]): JsonRecord {
  const { work, source, catalogId, position } = entry;
  const keywords = keywordsFrom(work.description);
  if (keywords.length === 0) throw new Error(`${work.slug}: description yields no review keywords.`);
  const provenance = provenanceFor(entry);
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
      provenance,
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

/**
 * A swap introduces a NEW SHA-256 that no human has ever reviewed for rights.
 * Rights and publication are granted by exactly one path —
 * scripts/catalog/import-approval-workbook.mjs, the only place with a real
 * `decision === "approve"` gate — so the row this script produces lands
 * explicitly unapproved and unpublished. It inherits the replaced work's price
 * and sale mode because the ladder and the exclusive/repeatable split are owner
 * decisions this script must preserve, never recompute.
 */
const pendingApprovalRecordFor = (
  record: JsonRecord,
  entry: (typeof swapped)[number],
): JsonRecord => ({
  ...record,
  rightsApproved: false,
  published: false,
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
  nextApproved[approvedIndex] = pendingApprovalRecordFor(record, entry);
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
// The rows this swap introduces are unapproved by construction, so the approved
// catalog projection rejects them. That is the correct, intended outcome: it is
// the downstream inconsistency that stops a never-reviewed SHA from shipping.
// Report it as an approval-workflow instruction rather than a generic failure.
const introducedCatalogIds = new Set(swapped.map(({ catalogId }) => catalogId));
const pendingApprovalIssues = importBuild.issues.filter(
  ({ code, catalogId }) =>
    code === "NOT_APPROVED" && catalogId !== null && introducedCatalogIds.has(catalogId),
);
const otherImportIssues = importBuild.issues.filter(
  (issue) => !pendingApprovalIssues.includes(issue),
);
if (pendingApprovalIssues.length > 0) {
  failures.push(
    `${pendingApprovalIssues.length} newly introduced SHA-256 identit${pendingApprovalIssues.length === 1 ? "y is" : "ies are"} ` +
      "unapproved and unpublished, which is the only honest state a swap may produce. This script " +
      "must never grant rights or publication to a work no one has reviewed. Run " +
      "`npm run catalog:approval:build`, record the owner's decision in the workbook, then " +
      "`npm run catalog:approval:import` (the only path with a real `decision === \"approve\"` gate). " +
      `Pending: ${pendingApprovalIssues.map(({ catalogId }) => catalogId).join(", ")}`,
  );
}
if (otherImportIssues.length > 0) {
  failures.push(`approved catalog import: ${otherImportIssues.map(({ code }) => code).join(", ")}`);
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
    // Cap at the public ceiling; a source already at or below it keeps its size.
    const displaySize = Math.min(entry.source.width, PUBLIC_DISPLAY_MAX_DIMENSION);
    await execFileAsync(pythonBin, [
      "-c",
      encodeDisplayDerivative,
      entry.source.absolutePath,
      target,
      String(displaySize),
    ]);
    const written = await readFile(target);
    const header = decodeImageHeader(written);
    if (header.format !== "jpeg" || header.width !== displaySize || header.height !== displaySize) {
      throw new Error(
        `${entry.work.slug}.jpg is not a square ${displaySize}x${displaySize} JPEG derivative of its source.`,
      );
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
