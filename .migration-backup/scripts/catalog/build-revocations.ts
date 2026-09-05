import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCatalogRevocations } from "../../src/lib/artcovr/catalog-revocation.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const inputPath = path.join(projectRoot, "catalog", "revoked-artworks.json");
const outputPath = path.join(projectRoot, "supabase", "seed", "catalog-revocations.generated.sql");
const write = process.argv.includes("--write");
const unknown = process.argv.slice(2).filter((argument) => argument !== "--write");
if (unknown.length > 0) throw new Error(`Unknown arguments: ${unknown.join(", ")}.`);

const build = buildCatalogRevocations(JSON.parse(await readFile(inputPath, "utf8")));
if (build.issues.length > 0) throw new Error(build.issues.join(", "));
if (write && build.rows.length === 0) throw new Error("Refusing to write an empty revocation artifact.");
if (write) {
  const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, build.sql, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

console.log(JSON.stringify({ mode: write ? "write" : "dry-run", revocations: build.rows.length, sourceSha256: build.sourceSha256, liveConnectionAttempted: false }));
