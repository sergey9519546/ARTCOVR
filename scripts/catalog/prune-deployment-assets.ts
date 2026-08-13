import { readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

const targetPublicRoot = path.resolve(process.argv[2] ?? "");
const normalized = targetPublicRoot.replaceAll("\\", "/");
if (!/^\/tmp\/build_fullstack_[A-Za-z0-9._-]+\/next-service-dist\/public$/.test(normalized)) {
  throw new Error(`Refusing to prune outside a validated deployment staging directory: ${targetPublicRoot}`);
}

const projectRoot = path.resolve(import.meta.dirname, "../..");
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
const artworkDirectory = path.join(targetPublicRoot, "assets", "artworks");
let removed = 0;
for (const entry of await readdir(artworkDirectory, { withFileTypes: true }).catch(() => [])) {
  if (!entry.isFile() || allowed.has(entry.name)) continue;
  await rm(path.join(artworkDirectory, entry.name), { force: true });
  removed += 1;
}

console.log(JSON.stringify({ publishedAssets: allowed.size, removedUnpublishedAssets: removed }));
