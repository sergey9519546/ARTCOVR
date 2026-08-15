import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { selectPublicCatalog } from "../../src/lib/artcovr/catalog-visibility.ts";

/**
 * Post-build gate: a non-staging export must not contain a single reference to
 * any unapproved staging-review artwork — not in HTML, RSC payloads, JS
 * chunks, the sitemap, or asset paths. This closes the class of leak where
 * the review catalog survives inside bundled JavaScript even though no page
 * renders it.
 *
 * The allowed set is derived from `selectPublicCatalog(...)`, the same
 * rights+publication gate src/lib/artcovr/artworks.ts applies, so approval
 * state decides what may appear — not mere presence in curated-public.json. A
 * row sitting in the public projection with `rightsApproved: false` is
 * forbidden here exactly as it is unrenderable there.
 *
 * The scan is also self-checking. A leak scan that searches for zero strings,
 * or that reads zero files, reports "no violations" for a reason that has
 * nothing to do with the export being clean; both are treated as gate
 * failures so a vacuous pass can never be mistaken for a real one.
 */
const projectRoot = path.resolve(import.meta.dirname, "../..");

if (process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING === "1") {
  console.log(JSON.stringify({ skipped: "private_staging_build" }));
  process.exit(0);
}

type CatalogRow = { slug?: unknown; rightsApproved?: unknown; published?: unknown };

const fail = (error: string, detail: Record<string, unknown>): never => {
  console.error(JSON.stringify({ error, ...detail }, null, 2));
  process.exit(1);
};

const readCatalog = async (fileName: string): Promise<CatalogRow[]> => {
  const filePath = path.join(projectRoot, "src", "lib", "artcovr", fileName);
  const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) fail("CATALOG_NOT_ARRAY", { file: fileName });
  return parsed as CatalogRow[];
};

const review = await readCatalog("curated-review.json");
const publicProjection = await readCatalog("curated-public.json");

const slugOf = (row: CatalogRow): string => (typeof row.slug === "string" ? row.slug : "");

const reviewSlugs = new Set(review.map(slugOf).filter(Boolean));
if (reviewSlugs.size === 0 || reviewSlugs.size !== review.length) {
  fail("REVIEW_CATALOG_UNUSABLE", {
    reason: "the review catalog must hold a non-empty set of unique, non-empty slugs",
    rows: review.length,
    uniqueSlugs: reviewSlugs.size,
  });
}

// Approval, not presence. Non-boolean flags coerce to false so an unexpected
// value fails closed into the forbidden set.
const allowedSlugs = new Set(
  selectPublicCatalog(
    publicProjection.map((row) => ({
      slug: slugOf(row),
      rightsApproved: row.rightsApproved === true,
      published: row.published === true,
    })),
  )
    .map(({ slug }) => slug)
    .filter(Boolean),
);

// The published projection must be a strict subset of the review set: a slug
// that was never under review cannot have been approved out of it, and if one
// appears here the two artifacts have drifted and the partition below is a lie.
const unreviewedPublicSlugs = [...allowedSlugs].filter((slug) => !reviewSlugs.has(slug));
if (unreviewedPublicSlugs.length > 0) {
  fail("PUBLIC_SLUG_NOT_UNDER_REVIEW", {
    reason: "curated-public.json approved a slug that curated-review.json does not contain",
    slugs: unreviewedPublicSlugs.slice(0, 10),
    total: unreviewedPublicSlugs.length,
  });
}

const forbiddenSlugs = [...reviewSlugs].filter((slug) => !allowedSlugs.has(slug));
if (allowedSlugs.size + forbiddenSlugs.length !== reviewSlugs.size) {
  fail("PARTITION_MISMATCH", {
    reason: "every reviewed slug must be either approved-and-published or forbidden",
    reviewSlugs: reviewSlugs.size,
    allowed: allowedSlugs.size,
    forbidden: forbiddenSlugs.length,
  });
}

const forbiddenSlugSet = new Set(forbiddenSlugs);
const exportRoot = path.join(projectRoot, "out");
const scannableExtensions = new Set([
  ".html", ".js", ".mjs", ".txt", ".json", ".xml", ".css", ".map", ".webmanifest",
]);

const violations: Array<{ file: string; slug: string }> = [];
// Detector self-test: slugs that are allowed AND actually observed in the
// export prove the scanner can see catalog slugs in this build's output.
const observedAllowedSlugs = new Set<string>();
let pendingAllowedSlugs = [...allowedSlugs];
let scanned = 0;
const entries = await readdir(exportRoot, { withFileTypes: true, recursive: true }).catch(
  (cause: unknown) => {
    fail("EXPORT_ROOT_UNREADABLE", { exportRoot, cause: String(cause) });
    return [] as never[];
  },
);
for (const entry of entries) {
  if (!entry.isFile()) continue;
  const filePath = path.join(entry.parentPath, entry.name);
  const relative = path.relative(exportRoot, filePath);
  const slugFromAssetName = relative.startsWith(path.join("assets", "artworks"))
    ? path.parse(entry.name).name
    : null;
  if (slugFromAssetName && forbiddenSlugSet.has(slugFromAssetName)) {
    violations.push({ file: relative, slug: slugFromAssetName });
    continue;
  }
  if (slugFromAssetName && allowedSlugs.has(slugFromAssetName)) {
    observedAllowedSlugs.add(slugFromAssetName);
    pendingAllowedSlugs = pendingAllowedSlugs.filter((slug) => slug !== slugFromAssetName);
  }
  if (!scannableExtensions.has(path.extname(entry.name).toLowerCase())) continue;
  const content = await readFile(filePath, "utf8");
  scanned += 1;
  for (const slug of forbiddenSlugs) {
    if (content.includes(slug)) {
      violations.push({ file: relative, slug });
      break;
    }
  }
  if (pendingAllowedSlugs.length > 0) {
    const stillPending: string[] = [];
    for (const slug of pendingAllowedSlugs) {
      if (content.includes(slug)) observedAllowedSlugs.add(slug);
      else stillPending.push(slug);
    }
    pendingAllowedSlugs = stillPending;
  }
}

if (violations.length > 0) {
  fail("STAGING_CATALOG_LEAK", {
    violations: violations.slice(0, 10),
    total: violations.length,
  });
}

// Below here the scan found nothing. Prove that means something.
if (scanned === 0) {
  fail("EMPTY_EXPORT_SCAN", {
    reason: "the leak scan read zero scannable files, so 'no violations' is not a result",
    exportRoot,
  });
}
if (forbiddenSlugs.length === 0 && observedAllowedSlugs.size === 0) {
  fail("VACUOUS_LEAK_SCAN", {
    reason:
      "no slug was forbidden and no approved slug was found in the export, so the scan " +
      "searched for nothing and proved nothing about isolation",
    reviewSlugs: reviewSlugs.size,
    allowedSlugs: allowedSlugs.size,
    scannedFiles: scanned,
  });
}

console.log(
  JSON.stringify({
    scannedFiles: scanned,
    reviewSlugs: reviewSlugs.size,
    allowedSlugs: allowedSlugs.size,
    forbiddenSlugs: forbiddenSlugs.length,
    observedAllowedSlugs: observedAllowedSlugs.size,
    violations: 0,
  }),
);
