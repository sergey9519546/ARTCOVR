import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPROVED_CATALOG_SOURCE,
  CATALOG_MANIFEST_OUTPUT,
  CATALOG_SQL_OUTPUT,
  buildCatalogImport,
  serializeCatalogImportManifest,
  sha256,
} from "../../src/lib/artcovr/catalog-import.ts";

const allowedArguments = new Set(["--write"]);
const unknownArguments = process.argv.slice(2).filter((argument) => !allowedArguments.has(argument));
if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}. Only --write is supported.`);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const inputPath = path.join(projectRoot, ...APPROVED_CATALOG_SOURCE.split("/"));
const sqlOutputPath = path.join(projectRoot, ...CATALOG_SQL_OUTPUT.split("/"));
const manifestOutputPath = path.join(projectRoot, ...CATALOG_MANIFEST_OUTPUT.split("/"));
const writeArtifacts = process.argv.includes("--write");

const input = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
const build = buildCatalogImport(input);
const emptyArtifact = build.rows.length === 0;
if (build.issues.length > 0 || emptyArtifact) {
  console.error(
    JSON.stringify(
      {
        mode: writeArtifacts ? "write-blocked" : "dry-run-blocked",
        source: APPROVED_CATALOG_SOURCE,
        sourceSha256: build.sourceSha256,
        emittedRows: 0,
        issues: [
          ...build.issues,
          ...(emptyArtifact
            ? [{ index: -1, catalogId: null, code: "EMPTY_APPROVED_CATALOG", message: "No approved artwork rows may be imported." }]
            : []),
        ],
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} else {
  const manifest = serializeCatalogImportManifest(build.manifest);
  if (writeArtifacts) {
    const writeAtomic = async (targetPath: string, contents: string) => {
      const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
      await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
      try {
        await rename(temporaryPath, targetPath);
      } catch (error) {
        await rm(temporaryPath, { force: true });
        throw error;
      }
    };
    await Promise.all([writeAtomic(sqlOutputPath, build.sql), writeAtomic(manifestOutputPath, manifest)]);
  }

  console.log(
    JSON.stringify(
      {
        mode: writeArtifacts ? "write" : "dry-run",
        source: APPROVED_CATALOG_SOURCE,
        sourceSha256: build.sourceSha256,
        emittedRows: build.rows.length,
        sqlSha256: sha256(build.sql),
        manifestSha256: sha256(manifest),
        outputs: writeArtifacts ? [CATALOG_SQL_OUTPUT, CATALOG_MANIFEST_OUTPUT] : [],
        liveConnectionAttempted: false,
      },
      null,
      2,
    ),
  );
}
