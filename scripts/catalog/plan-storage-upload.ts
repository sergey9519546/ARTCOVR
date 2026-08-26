import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { buildCatalogImport, canonicalJson } from "../../src/lib/artcovr/catalog-import.ts";
import { decodeImageHeader } from "../../src/lib/artcovr/catalog-source.ts";

const BUCKET = "art-assets";
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const privateRoot = process.env.ARTCOVR_PRIVATE_ROOT ?? "E:\\ART_COLLECTION\\.artcovr-private";
const sourceMapPath = path.join(privateRoot, "direct-source-map.local.json");
const approvedPath = path.join(projectRoot, "catalog", "approved-artworks.json");
const planPath = path.join(projectRoot, "outputs", "catalog", "storage-upload-plan.private.json");
const writePlan = process.argv.includes("--write-plan");
const applyArgument = process.argv.slice(2).find((argument) => argument.startsWith("--apply="));
const catalogIdFileArgument = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--catalog-id-file="));
const unknownArguments = process.argv
  .slice(2)
  .filter(
    (argument) =>
      argument !== "--write-plan" &&
      !argument.startsWith("--apply=") &&
      !argument.startsWith("--catalog-id-file="),
  );
if (unknownArguments.length > 0) {
  throw new Error(`Unknown arguments: ${unknownArguments.join(", ")}.`);
}

const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const mimeFor = (format: "png" | "jpeg") => format === "png" ? "image/png" : "image/jpeg";

type PlannedAsset = {
  objectKey: string;
  localPath: string;
  sha256: string;
  bytes: number;
  contentType: "image/png" | "image/jpeg";
  width: number;
  height: number;
};

type PlannedArtwork = {
  catalogId: string;
  sourceSha256: string;
  base: PlannedAsset;
  catalog: PlannedAsset;
};

const approved = JSON.parse(await readFile(approvedPath, "utf8")) as unknown;
const build = buildCatalogImport(approved);
if (build.issues.length > 0) {
  throw new Error(`Approved catalog is invalid: ${build.issues.map(({ code }) => code).join(", ")}`);
}
if (build.rows.length === 0) throw new Error("EMPTY_APPROVED_CATALOG");

// Delete-tier rows never reach the storefront: their display derivatives are
// removed from public/ and nothing may be sold, so nothing gets uploaded.
const deleteTierIds = new Set(
  (approved as Array<{ id?: unknown; tier?: unknown }>)
    .filter((row) => row.tier === "delete" && typeof row.id === "string")
    .map((row) => row.id as string),
);

const sourceMap = JSON.parse(await readFile(sourceMapPath, "utf8")) as Array<{
  id: string;
  sha256: string;
  sourceAbsolutePath: string;
}>;
const sourceById = new Map(sourceMap.map((entry) => [entry.id, entry]));
if (sourceById.size !== sourceMap.length) throw new Error("Private source map contains duplicate ids.");

let selectedCatalogIds: Set<string> | null = null;
if (catalogIdFileArgument) {
  const catalogIdFile = path.resolve(catalogIdFileArgument.slice("--catalog-id-file=".length));
  const selected = JSON.parse(await readFile(catalogIdFile, "utf8")) as unknown;
  if (
    !Array.isArray(selected) ||
    selected.length === 0 ||
    selected.some((id) => typeof id !== "string" || !/^art_[0-9a-f]{20}$/.test(id))
  ) {
    throw new Error("Catalog id file must be a non-empty JSON array of canonical catalog ids.");
  }
  selectedCatalogIds = new Set(selected);
  if (selectedCatalogIds.size !== selected.length) throw new Error("Catalog id file contains duplicate ids.");
  const approvedIds = new Set(build.rows.map((row) => row.catalogId));
  for (const id of selectedCatalogIds) {
    if (!approvedIds.has(id) || deleteTierIds.has(id)) {
      throw new Error(`Catalog id selection is not a publishable approved row: ${id}.`);
    }
  }
}

const entries: PlannedArtwork[] = [];
for (const row of build.rows) {
  if (deleteTierIds.has(row.catalogId)) continue;
  if (selectedCatalogIds && !selectedCatalogIds.has(row.catalogId)) continue;
  const source = sourceById.get(row.catalogId);
  if (!source || source.sha256 !== row.sourceSha256) {
    throw new Error(`Private source identity mismatch for ${row.catalogId}.`);
  }
  const baseBytes = await readFile(source.sourceAbsolutePath);
  const baseHeader = decodeImageHeader(baseBytes);
  if (
    sha256(baseBytes) !== row.sourceSha256 ||
    baseBytes.byteLength !== row.sourceBytes ||
    baseHeader.width !== row.sourceWidth ||
    baseHeader.height !== row.sourceHeight ||
    mimeFor(baseHeader.format) !== row.sourceMimeType
  ) {
    throw new Error(`Private source bytes no longer match approved metadata for ${row.catalogId}.`);
  }

  const displayLocalPath = path.resolve(projectRoot, "public", row.catalogObjectKey);
  const publicRoot = `${path.resolve(projectRoot, "public")}${path.sep}`;
  if (!displayLocalPath.startsWith(publicRoot)) {
    throw new Error(`Catalog display path escapes public/ for ${row.catalogId}.`);
  }
  const displayBytes = await readFile(displayLocalPath);
  const displayHeader = decodeImageHeader(displayBytes);

  entries.push({
    catalogId: row.catalogId,
    sourceSha256: row.sourceSha256,
    base: {
      objectKey: row.baseObjectKey,
      localPath: source.sourceAbsolutePath,
      sha256: sha256(baseBytes),
      bytes: baseBytes.byteLength,
      contentType: mimeFor(baseHeader.format),
      width: baseHeader.width,
      height: baseHeader.height,
    },
    catalog: {
      objectKey: row.catalogObjectKey,
      localPath: displayLocalPath,
      sha256: sha256(displayBytes),
      bytes: displayBytes.byteLength,
      contentType: mimeFor(displayHeader.format),
      width: displayHeader.width,
      height: displayHeader.height,
    },
  });
}
entries.sort((left, right) => left.catalogId.localeCompare(right.catalogId, "en"));

const plan = {
  schemaVersion: 1,
  bucket: BUCKET,
  approvedArtifactSha256: build.sourceSha256,
  entries,
};
const serializedPlan = `${JSON.stringify(plan, null, 2)}\n`;
const planSha256 = sha256(canonicalJson(plan));

if (writePlan) {
  const temporaryPath = `${planPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, serializedPlan, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporaryPath, planPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

let applied = false;
if (applyArgument) {
  const confirmedPlanSha = applyArgument.slice("--apply=".length);
  if (!/^[0-9a-f]{64}$/.test(confirmedPlanSha) || confirmedPlanSha !== planSha256) {
    throw new Error("Apply requires the exact SHA-256 printed by the current dry-run plan.");
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service credentials are required for apply.");
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ensureAsset = async (asset: PlannedAsset) => {
    const existing = await client.storage.from(BUCKET).download(asset.objectKey);
    if (!existing.error && existing.data) {
      const existingBytes = new Uint8Array(await existing.data.arrayBuffer());
      if (sha256(existingBytes) !== asset.sha256) {
        throw new Error(`Refusing to overwrite mismatched Storage object ${asset.objectKey}.`);
      }
      return;
    }
    const localBytes = await readFile(asset.localPath);
    const upload = await client.storage.from(BUCKET).upload(asset.objectKey, localBytes, {
      contentType: asset.contentType,
      upsert: false,
    });
    if (upload.error) throw new Error(`Storage upload failed for ${asset.objectKey}: ${upload.error.message}`);
    const verification = await client.storage.from(BUCKET).download(asset.objectKey);
    if (verification.error || !verification.data) {
      throw new Error(`Storage verification download failed for ${asset.objectKey}.`);
    }
    const verifiedBytes = new Uint8Array(await verification.data.arrayBuffer());
    if (sha256(verifiedBytes) !== asset.sha256) {
      throw new Error(`Storage verification hash mismatch for ${asset.objectKey}.`);
    }
  };

  for (const entry of entries) {
    await ensureAsset(entry.base);
    await ensureAsset(entry.catalog);
  }
  applied = true;
}

console.log(JSON.stringify({
  mode: applied ? "applied-and-verified" : "dry-run",
  bucket: BUCKET,
  approvedRows: entries.length,
  selectedCatalogIds: selectedCatalogIds?.size ?? null,
  objects: entries.length * 2,
  planSha256,
  planWritten: writePlan ? planPath : null,
  liveConnectionAttempted: Boolean(applyArgument),
}, null, 2));
