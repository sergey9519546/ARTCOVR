import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

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
) as Array<{ image?: unknown }>;
if (!Array.isArray(projection)) throw new Error("Public catalog projection must be an array.");

const allowed = new Set(
  projection.map(({ image }) => {
    if (typeof image !== "string" || !image.startsWith("/assets/artworks/")) {
      throw new Error("Every published artwork image must use /assets/artworks/.");
    }
    return image.slice("/assets/artworks/".length);
  }),
);
const artworkDirectory = path.join(targetRoot, "assets", "artworks");
let removed = 0;
const entries = await readdir(artworkDirectory, {
  withFileTypes: true,
  recursive: true,
}).catch(() => []);
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

console.log(JSON.stringify({ publishedAssets: allowed.size, removedUnpublishedAssets: removed }));
