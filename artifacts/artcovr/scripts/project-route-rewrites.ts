import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import curatedPublic from "../src/lib/artcovr/curated-public.json" with { type: "json" };
import { selectPublicCatalog } from "../src/lib/artcovr/catalog-visibility";
import { getIndexableRoutePaths } from "../src/lib/artcovr/route-metadata";

const configPath = fileURLToPath(new URL("../.replit-artifact/artifact.toml", import.meta.url));
const start = "# BEGIN GENERATED CATALOG ROUTE REWRITES";
const end = "# END GENERATED CATALOG ROUTE REWRITES";
const routes = getIndexableRoutePaths(selectPublicCatalog(curatedPublic))
  .filter((route) => route === "/cover-art" || route.startsWith("/cover-art/") || route.startsWith("/product/"))
  .sort();
const block = [start, "# Regenerate with pnpm run routes:project; exact matches preserve unknown-route 404s.",
  ...routes.flatMap((route) => [route, route + "/"].map((from) =>
    '[[services.production.rewrites]]\nfrom = ' + JSON.stringify(from) + '\nto = ' + JSON.stringify(route + '/index.html'))), end].join("\n\n");
let original = readFileSync(configPath, "utf8");
let next = original;
if (next.includes(start)) {
  const a = next.indexOf(start), b = next.indexOf(end, a);
  if (b < 0) throw new Error("Unclosed generated route block");
  next = next.slice(0, a) + block + next.slice(b + end.length);
} else {
  next = next.replace(/\[\[services\.production\.rewrites\]\]\s*from = "\/cover-art"\s*to = "\/cover-art\/index\.html"\s*/g, "");
  const marker = "[services.env]";
  if (!next.includes(marker)) throw new Error("Missing services.env insertion point");
  next = next.replace(marker, block + "\n\n" + marker);
}
if (process.argv.includes("--check")) {
  if (next !== original) throw new Error("Catalog route rewrites are stale. Run pnpm run routes:project and commit artifact.toml before publishing.");
} else if (next !== original) writeFileSync(configPath, next);
console.log("Catalog route rewrites: " + routes.length + " routes, " + routes.length * 2 + " exact mappings");
