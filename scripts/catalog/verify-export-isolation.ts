import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Post-build gate: a non-staging export must not contain a single reference to
 * any unapproved staging-review artwork — not in HTML, RSC payloads, JS
 * chunks, the sitemap, or asset paths. This closes the class of leak where
 * the review catalog survives inside bundled JavaScript even though no page
 * renders it.
 */
const projectRoot = path.resolve(import.meta.dirname, "../..");

if (process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING === "1") {
  console.log(JSON.stringify({ skipped: "private_staging_build" }));
  process.exit(0);
}

const review = JSON.parse(
  await readFile(
    path.join(projectRoot, "src", "lib", "artcovr", "curated-review.json"),
    "utf8",
  ),
) as Array<{ slug?: unknown; rightsApproved?: unknown; published?: unknown }>;
const approved = JSON.parse(
  await readFile(
    path.join(projectRoot, "src", "lib", "artcovr", "curated-public.json"),
    "utf8",
  ),
) as Array<{ slug?: unknown }>;

const approvedSlugs = new Set(
  approved.map((row) => String(row.slug ?? "")).filter(Boolean),
);
const forbiddenSlugs = review
  .map((row) => String(row.slug ?? ""))
  .filter((slug) => slug.length > 0 && !approvedSlugs.has(slug));

const exportRoot = path.join(projectRoot, "out");
const scannableExtensions = new Set([
  ".html", ".js", ".mjs", ".txt", ".json", ".xml", ".css", ".map", ".webmanifest",
]);

const violations: Array<{ file: string; slug: string }> = [];
let scanned = 0;
const entries = await readdir(exportRoot, { withFileTypes: true, recursive: true });
for (const entry of entries) {
  if (!entry.isFile()) continue;
  const filePath = path.join(entry.parentPath, entry.name);
  const relative = path.relative(exportRoot, filePath);
  const slugFromAssetName = relative.startsWith(path.join("assets", "artworks"))
    ? path.parse(entry.name).name
    : null;
  if (slugFromAssetName && forbiddenSlugs.includes(slugFromAssetName)) {
    violations.push({ file: relative, slug: slugFromAssetName });
    continue;
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
}

if (violations.length > 0) {
  console.error(
    JSON.stringify(
      { error: "STAGING_CATALOG_LEAK", violations: violations.slice(0, 10), total: violations.length },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify({ scannedFiles: scanned, forbiddenSlugs: forbiddenSlugs.length, violations: 0 }),
);
