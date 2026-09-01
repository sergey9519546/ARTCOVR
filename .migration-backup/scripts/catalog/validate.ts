import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCatalogImport } from "../../src/lib/artcovr/catalog-import.ts";
import { PUBLIC_DISPLAY_MAX_DIMENSION } from "./display-contract.ts";
import {
  decodeImageHeader,
  validateCandidateMetadata,
  type CandidateMetadata,
} from "../../src/lib/artcovr/catalog-source.ts";

type CatalogCandidate = {
  id: string;
  slug: string;
  tier?: string;
  width: number;
  height: number;
  sha256: string;
  sourceMimeType: string;
  displayPath: string;
};

type ValidationFailure = {
  id: string;
  code: string;
  message?: string;
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const privateRoot = process.env.ARTCOVR_PRIVATE_ROOT
  ? path.resolve(process.env.ARTCOVR_PRIVATE_ROOT)
  : "E:\\ART_COLLECTION\\.artcovr-private";
const argumentsList = process.argv.slice(2);
const scopeArgument = argumentsList.find((argument) => argument.startsWith("--scope="));
const catalogIdFileArgument = argumentsList.find((argument) =>
  argument.startsWith("--catalog-id-file="),
);
const scope = scopeArgument?.slice("--scope=".length) ??
  (catalogIdFileArgument ? "source-subset" : "publication");
const allowedArguments = argumentsList.filter(
  (argument) => argument.startsWith("--scope=") || argument.startsWith("--catalog-id-file="),
);
if (allowedArguments.length !== argumentsList.length) {
  throw new Error(
    `Unknown arguments: ${argumentsList.filter((argument) => !allowedArguments.includes(argument)).join(", ")}.`,
  );
}
if (!new Set(["publication", "review", "source-subset"]).has(scope)) {
  throw new Error("Catalog validation scope must be publication, review, or source-subset.");
}
if (scope === "source-subset" && !catalogIdFileArgument) {
  throw new Error("source-subset validation requires --catalog-id-file=<path>.");
}
if (scope !== "source-subset" && catalogIdFileArgument) {
  throw new Error("--catalog-id-file is only valid with source-subset validation.");
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const report = (scopeName: string, candidates: number, failures: ValidationFailure[]) => {
  console.log(
    JSON.stringify(
      {
        candidates,
        scope: scopeName,
        valid: candidates - new Set(failures.map(({ id }) => id)).size,
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) process.exitCode = 1;
};

async function validatePublication(): Promise<void> {
  const approvedPath = path.join(projectRoot, "catalog", "approved-artworks.json");
  const approved = JSON.parse(await readFile(approvedPath, "utf8")) as unknown;
  const build = buildCatalogImport(approved);
  const failures: ValidationFailure[] = build.issues.map((issue) => ({
    id: issue.catalogId ?? `row-${issue.index}`,
    code: issue.code,
    message: issue.message,
  }));
  if (!Array.isArray(approved)) {
    report("publication", 0, failures);
    return;
  }

  const expectedIds = new Set(
    approved
      .filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === "object" && entry !== null && !Array.isArray(entry) && entry.tier !== "delete",
      )
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === "string"),
  );
  const emittedIds = new Set(build.rows.map(({ catalogId }) => catalogId));
  if (
    expectedIds.size !== emittedIds.size ||
    [...expectedIds].some((catalogId) => !emittedIds.has(catalogId))
  ) {
    failures.push({
      id: "catalog",
      code: "PUBLICATION_SET_DRIFT",
      message: `Expected ${expectedIds.size} non-delete rows and emitted ${emittedIds.size}.`,
    });
  }

  const publicMetadata: CandidateMetadata[] = [];
  for (const row of build.rows) {
    try {
      const bytes = await readFile(path.join(projectRoot, "public", row.catalogObjectKey));
      const header = decodeImageHeader(bytes);
      const displaySha256 = sha256(bytes);
      publicMetadata.push({
        id: row.catalogId,
        width: header.width,
        height: header.height,
        bytes: bytes.byteLength,
        sha256: displaySha256,
      });
      if (header.format !== "jpeg") {
        failures.push({
          id: row.catalogId,
          code: "INVALID_PUBLIC_DERIVATIVE",
          message: "Published displays must be real JPEG derivatives.",
        });
      }
      if (displaySha256 === row.sourceSha256) {
        failures.push({
          id: row.catalogId,
          code: "PUBLIC_ASSET_PASSTHROUGH",
          message: "Published display bytes must not equal the clean source SHA-256.",
        });
      }
      // PUBLIC_ASSET_PASSTHROUGH compares bytes, which a format conversion always
      // changes — so it can never catch a PNG master re-encoded to JPEG at full
      // master resolution. That blind spot is why 43 PNG-mastered works shipped
      // previews at 1280 while every JPEG-mastered work was caught and re-encoded
      // to 1024. Bound the dimension directly instead of inferring it from bytes.
      if (header.width > PUBLIC_DISPLAY_MAX_DIMENSION || header.height > PUBLIC_DISPLAY_MAX_DIMENSION) {
        failures.push({
          id: row.catalogId,
          code: "PUBLIC_DERIVATIVE_OVERSIZED",
          message:
            `Published display is ${header.width}x${header.height}; the public preview ceiling is ` +
            `${PUBLIC_DISPLAY_MAX_DIMENSION}px per side.`,
        });
      }
      if (header.width !== header.height) {
        failures.push({
          id: row.catalogId,
          code: "PUBLIC_DERIVATIVE_NOT_SQUARE",
          message: `Published display must be square; found ${header.width}x${header.height}.`,
        });
      }
    } catch {
      failures.push({
        id: row.catalogId,
        code: "PUBLIC_DERIVATIVE_UNREADABLE",
        message: "The protected public derivative is missing or unreadable.",
      });
    }
  }
  failures.push(...validateCandidateMetadata(publicMetadata));
  report("publication", build.rows.length, failures);
}

async function validatePrivateSources(scopeName: "review" | "source-subset"): Promise<void> {
  const candidatePath = path.join(
    projectRoot,
    "catalog",
    scopeName === "review" ? "curated-artworks.json" : "approved-artworks.json",
  );
  const artifact = JSON.parse(await readFile(candidatePath, "utf8")) as CatalogCandidate[];
  if (!Array.isArray(artifact)) throw new Error("Catalog source artifact must be an array.");
  let candidates = artifact;
  if (scopeName === "review" && candidates.length !== 100) {
    throw new Error(`Curated launch-review catalog must contain exactly 100 candidates; received ${candidates.length}.`);
  }
  if (scopeName === "source-subset") {
    const catalogIdFile = path.resolve(
      (catalogIdFileArgument as string).slice("--catalog-id-file=".length),
    );
    const selected = JSON.parse(await readFile(catalogIdFile, "utf8")) as unknown;
    if (!Array.isArray(selected) || selected.length === 0 || selected.some((id) => typeof id !== "string")) {
      throw new Error("Catalog id file must be a non-empty JSON string array.");
    }
    const selectedIds = new Set(selected as string[]);
    if (selectedIds.size !== selected.length) throw new Error("Catalog id file contains duplicate ids.");
    candidates = artifact.filter(({ id }) => selectedIds.has(id));
    if (candidates.length !== selectedIds.size) throw new Error("Catalog id file contains an unknown approved id.");
  }

  const sourceMapEntries = JSON.parse(
    await readFile(path.join(privateRoot, "direct-source-map.local.json"), "utf8"),
  ) as Array<{ id: string; sha256: string; sourceAbsolutePath: string }>;
  const sourceMap = new Map(sourceMapEntries.map((entry) => [entry.id, entry]));
  const failures: ValidationFailure[] = [];
  const metadata: CandidateMetadata[] = [];
  if (sourceMap.size !== sourceMapEntries.length) {
    failures.push({
      id: "catalog",
      code: "SOURCE_MAP_DRIFT",
      message: "The private source map contains duplicate catalog ids.",
    });
  }

  for (const candidate of candidates) {
    try {
      const sourceEntry = sourceMap.get(candidate.id);
      if (!sourceEntry) throw new Error("missing-source-map-entry");
      if (sourceEntry.sha256 !== candidate.sha256) {
        failures.push({ id: candidate.id, code: "SOURCE_MAP_DRIFT" });
      }
      const source = await readFile(sourceEntry.sourceAbsolutePath);
      const header = decodeImageHeader(source);
      const sourceSha256 = sha256(source);
      metadata.push({
        id: candidate.id,
        width: header.width,
        height: header.height,
        bytes: source.byteLength,
        sha256: sourceSha256,
      });
      if (
        header.width !== candidate.width ||
        header.height !== candidate.height ||
        `image/${header.format}` !== candidate.sourceMimeType ||
        sourceSha256 !== candidate.sha256
      ) {
        failures.push({ id: candidate.id, code: "MANIFEST_DRIFT" });
      }
      const derivativePath = scopeName === "review"
        ? path.join(projectRoot, "outputs", "catalog", "review-assets", `${candidate.slug}.jpg`)
        : path.join(projectRoot, "public", candidate.displayPath.replace(/^\//, ""));
      const derivative = await readFile(derivativePath);
      decodeImageHeader(derivative);
    } catch {
      failures.push({
        id: candidate.id,
        code: "SOURCE_OR_REVIEW_ASSET_UNREADABLE",
        message: "The private source mapping/source or expected review derivative is unavailable.",
      });
    }
  }
  failures.push(...validateCandidateMetadata(metadata));
  report(scopeName, candidates.length, failures);
}

if (scope === "publication") await validatePublication();
else await validatePrivateSources(scope as "review" | "source-subset");
