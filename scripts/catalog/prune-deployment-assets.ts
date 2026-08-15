import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import { selectPublicCatalog } from "../../src/lib/artcovr/catalog-visibility.ts";

const projectRoot = path.resolve(import.meta.dirname, "../..");

// Private staging builds are owner-review surfaces and intentionally keep the
// 100 review derivatives. Only public production exports are pruned down to
// the approved projection.
if (process.env.NEXT_PUBLIC_ARTCOVR_PRIVATE_STAGING === "1") {
  console.log(JSON.stringify({ skipped: "private_staging_build" }));
  process.exit(0);
}

const targetRoot = path.resolve(process.argv[2] ?? path.join(projectRoot, "out"));
const normalized = targetRoot.replaceAll("\\", "/");
const exportRoot = path.join(projectRoot, "out").replaceAll("\\", "/");
const legacyStagingPattern =
  /^\/tmp\/build_fullstack_[A-Za-z0-9._-]+\/next-service-dist\/public$/;
if (normalized !== exportRoot && !legacyStagingPattern.test(normalized)) {
  throw new Error(
    `Refusing to prune outside the static export or a validated deployment staging directory: ${targetRoot}`,
  );
}

const projection = JSON.parse(
  await readFile(path.join(projectRoot, "src", "lib", "artcovr", "curated-public.json"), "utf8"),
) as Array<{ image?: unknown; rightsApproved?: unknown; published?: unknown }>;
if (!Array.isArray(projection)) throw new Error("Public catalog projection must be an array.");

const assetNameOf = (image: unknown): string => {
  if (typeof image !== "string" || !image.startsWith("/assets/artworks/")) {
    throw new Error("Every published artwork image must use /assets/artworks/.");
  }
  return image.slice("/assets/artworks/".length);
};
// Shape is validated for every row, approved or not, so a malformed projection
// still fails the build rather than being skipped by the approval filter.
const assetNames = projection.map(({ image }) => assetNameOf(image));

// Presence in the projection is not approval. A JPEG stays in the export only
// if its row passes the same rights+publication gate src/lib/artcovr/artworks.ts
// applies; otherwise the file remains publicly fetchable at its URL even though
// no page links it. Non-boolean flags coerce to false, so the filter fails closed.
const publishable = selectPublicCatalog(
  projection.map((row, index) => ({
    assetName: assetNames[index],
    rightsApproved: row.rightsApproved === true,
    published: row.published === true,
  })),
);
const allowed = new Set(publishable.map(({ assetName }) => assetName));
const withheldUnapprovedRows = projection.length - publishable.length;

const artworkDirectory = path.join(targetRoot, "assets", "artworks");
let removed = 0;
// A missing artwork directory is a real failure: swallowing it turned a broken
// export into a silent "pruned 0 assets" success.
const entries = await readdir(artworkDirectory, {
  withFileTypes: true,
  recursive: true,
}).catch((cause: unknown) => {
  throw new Error(
    `Cannot read the artwork asset directory ${artworkDirectory}: the export is incomplete or the prune target is wrong.`,
    { cause },
  );
});
for (const entry of entries) {
  if (entry.isDirectory()) continue;
  const entryPath = path.join(entry.parentPath, entry.name);
  const isTopLevelFile =
    entry.isFile() && path.resolve(entry.parentPath) === path.resolve(artworkDirectory);
  // Publish-only-approved: a top-level regular file with an approved name may
  // stay; every other entry (nested files, symlinks, unexpected types) is
  // removed so nothing unapproved can ride along in the export.
  if (isTopLevelFile && allowed.has(entry.name)) continue;
  await rm(entryPath, { force: true, recursive: true });
  removed += 1;
}

console.log(
  JSON.stringify({
    catalogRows: projection.length,
    publishedAssets: allowed.size,
    withheldUnapprovedRows,
    removedUnpublishedAssets: removed,
  }),
);
