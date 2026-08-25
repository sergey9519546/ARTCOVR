import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { projectApprovedCatalog } from "../../src/lib/artcovr/catalog-projection.ts";
import { decodeImageHeader } from "../../src/lib/artcovr/catalog-source.ts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const approvedPath = path.join(projectRoot, "catalog", "approved-artworks.json");
const projectionPath = path.join(projectRoot, "src", "lib", "artcovr", "curated-public.json");
const checkOnly = process.argv.includes("--check");
const requireLaunchCatalog = process.argv.includes("--launch");
const allowedArguments = new Set(["--check", "--launch"]);
const unknownArguments = process.argv.slice(2).filter((argument) => !allowedArguments.has(argument));
if (unknownArguments.length > 0) throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}.`);

const approved = JSON.parse(await readFile(approvedPath, "utf8")) as unknown;
if (!Array.isArray(approved)) throw new Error("Approved catalog must be a JSON array.");
const projected = approved.length === 0 ? [] : projectApprovedCatalog(approved);
const launchCountValid = projected.length >= 100 && projected.length <= 200;
if (requireLaunchCatalog && !launchCountValid) {
  throw new Error(`Launch requires 100–200 publishable artworks; received ${projected.length}.`);
}
for (const artwork of projected) {
  const displayPath = path.resolve(projectRoot, "public", artwork.image.replace(/^\/+/, ""));
  const publicRoot = `${path.resolve(projectRoot, "public")}${path.sep}`;
  if (!displayPath.startsWith(publicRoot)) throw new Error(`Display path escapes public/: ${artwork.id}`);
  const display = decodeImageHeader(await readFile(displayPath));
  if (display.width !== display.height) throw new Error(`Display asset is not square: ${artwork.id}`);
}
const serialized = `${JSON.stringify(projected, null, 2)}\n`;

if (checkOnly) {
  const current = await readFile(projectionPath, "utf8");
  if (current.replace(/\r\n/g, "\n") !== serialized.replace(/\r\n/g, "\n")) {
    throw new Error("Public catalog projection is stale. Run npm run catalog:project.");
  }
} else {
  if (approved.length === 0) throw new Error("Refusing to publish an empty approved catalog.");
  const temporaryPath = `${projectionPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporaryPath, projectionPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

console.log(JSON.stringify({
  approvedPath,
  projectionPath,
  checkOnly,
  approvedRows: approved.length,
  publishableRows: projected.length,
  launchCountValid,
}, null, 2));
