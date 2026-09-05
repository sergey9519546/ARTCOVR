import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  buildCatalogIntelligenceManifest,
  getCatalogManifestPayloadPaths,
  serializeCatalogIntelligenceManifest,
  verifyCatalogIntelligenceManifest,
  type CatalogManifestFileInput,
} from "../src/lib/artcovr/catalog-manifest.ts";

type Command = "generate" | "verify";

function flag(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}.`);
  return value;
}

async function filesInDirectory(root: string): Promise<CatalogManifestFileInput[]> {
  const files: CatalogManifestFileInput[] = [];
  async function visit(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push({
          path: relative(root, absolute).replaceAll("\\", "/"),
          content: await readFile(absolute),
        });
      }
    }
  }
  await visit(root);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function catalogFromFile(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function printIssues(issues: readonly { code: string; message: string }[]): void {
  for (const issue of issues) console.error(`[${issue.code}] ${issue.message}`);
}

async function main() {
  const command = process.argv.find((argument): argument is Command =>
    argument === "generate" || argument === "verify",
  );
  if (command !== "generate" && command !== "verify") {
    throw new Error("Usage: generate|verify --bundle-dir DIR --catalog-file FILE --source-version REV ...");
  }

  const bundleDir = resolve(flag("--bundle-dir"));
  const catalog = await catalogFromFile(resolve(flag("--catalog-file")));
  const sourceVersion = flag("--source-version");
  const vectorDimensions = Number(process.argv.includes("--vector-dimensions")
    ? flag("--vector-dimensions")
    : 512);
  if (!Number.isSafeInteger(vectorDimensions) || vectorDimensions <= 0) {
    throw new Error("--vector-dimensions must be a positive integer.");
  }
  const files = await filesInDirectory(bundleDir);
  const expectedCorpusSize = Number(process.argv.includes("--expected-corpus-size")
    ? flag("--expected-corpus-size")
    : 22_260);
  if (!Number.isSafeInteger(expectedCorpusSize) || expectedCorpusSize <= 0) {
    throw new Error("--expected-corpus-size must be a positive integer.");
  }

  if (command === "generate") {
    const out = resolve(flag("--out"));
    const manifest = buildCatalogIntelligenceManifest({
      catalog,
      files,
      sourceVersion,
      vectorDimensions,
      expectedCorpusSize,
    });
    await writeFile(out, serializeCatalogIntelligenceManifest(manifest), "utf8");
    console.log(`Wrote catalog intelligence manifest to ${out}`);
    console.log(`Recorded ${manifest.corpus.count} identities and ${manifest.payloads.length} payload files.`);
    return;
  }

  const manifest = JSON.parse(await readFile(resolve(flag("--manifest")), "utf8"));
  const result = verifyCatalogIntelligenceManifest({
    manifest,
    catalog,
    files,
    sourceVersion,
    vectorDimensions,
    expectedCorpusSize,
  });
  if (!result.ok) {
    printIssues(result.issues);
    throw new Error("Catalog intelligence manifest verification failed.");
  }
  console.log(`Verified ${result.manifest?.corpus.count ?? 0} identities and ${files.length} payload files.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});