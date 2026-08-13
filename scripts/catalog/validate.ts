import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  decodeImageHeader,
  validateCandidateMetadata,
  type CandidateIssue,
  type CandidateMetadata,
} from "../../src/lib/artcovr/catalog-source.ts";
import { LAUNCH_REVIEW_SIZE } from "../../src/lib/artcovr/catalog-review.ts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const privateRoot = process.env.ARTCOVR_PRIVATE_ROOT
  ? path.resolve(process.env.ARTCOVR_PRIVATE_ROOT)
  : "E:\\ART_COLLECTION\\.artcovr-private";
const candidatePath = path.join(projectRoot, "catalog", "curated-artworks.json");
const candidates = JSON.parse(await readFile(candidatePath, "utf8"));
const sourceMapEntries = JSON.parse(
  await readFile(path.join(privateRoot, "direct-source-map.local.json"), "utf8"),
) as Array<{ id: string; sha256: string; sourceAbsolutePath: string }>;
const sourceMap = new Map(sourceMapEntries.map((entry) => [entry.id, entry]));

if (!Array.isArray(candidates) || candidates.length !== LAUNCH_REVIEW_SIZE) {
  throw new Error(
    `Curated launch-review catalog must contain exactly ${LAUNCH_REVIEW_SIZE} candidates; received ${candidates.length}.`,
  );
}

type ValidationFailure = CandidateIssue | {
  id: string;
  code:
    | "MANIFEST_DRIFT"
    | "SOURCE_MAP_DRIFT"
    | "SOURCE_OR_REVIEW_ASSET_UNREADABLE";
  message?: string;
};

const metadata: CandidateMetadata[] = [];
const failures: ValidationFailure[] = [];
if (sourceMap.size !== sourceMapEntries.length || sourceMap.size !== candidates.length) {
  failures.push({
    id: "catalog",
    code: "SOURCE_MAP_DRIFT",
    message: `Expected exactly ${candidates.length} unique private source mappings; received ${sourceMap.size}.`,
  });
}
for (const candidate of candidates) {
  try {
    const sourceEntry = sourceMap.get(candidate.id);
    if (!sourceEntry) throw new Error(`Missing private source mapping for ${candidate.id}.`);
    if (sourceEntry.sha256 !== candidate.sha256) {
      failures.push({ id: candidate.id, code: "SOURCE_MAP_DRIFT" });
    }
    const source = await readFile(sourceEntry.sourceAbsolutePath);
    const header = decodeImageHeader(source);
    const sha256 = createHash("sha256").update(source).digest("hex");
    metadata.push({
      id: candidate.id,
      width: header.width,
      height: header.height,
      bytes: source.byteLength,
      sha256,
    });
    if (
      header.width !== candidate.width ||
      header.height !== candidate.height ||
      `image/${header.format}` !== candidate.sourceMimeType ||
      sha256 !== candidate.sha256
    ) {
      failures.push({ id: candidate.id, code: "MANIFEST_DRIFT" });
    }
    await access(
      path.join(projectRoot, "public", candidate.displayPath.replace(/^\//, "")),
    );
  } catch (error) {
    failures.push({
      id: candidate.id,
      code: "SOURCE_OR_REVIEW_ASSET_UNREADABLE",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

failures.push(...validateCandidateMetadata(metadata));
console.log(
  JSON.stringify(
    {
      candidates: candidates.length,
      valid: candidates.length - new Set(failures.map((failure) => failure.id)).size,
      failures,
    },
    null,
    2,
  ),
);
if (failures.length > 0) process.exitCode = 1;
