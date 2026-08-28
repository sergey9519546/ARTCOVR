import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const batchRoot = path.join(projectRoot, "outputs", "catalog", "review-assets", "candidate-selection-2026-08-20");
const planPath = path.join(batchRoot, "ARTCOVR_38_Approved_Priced_Intake.private.json");
const existingMapPath = process.env.ARTCOVR_EXISTING_SOURCE_MAP ??
  (process.env.ARTCOVR_PRIVATE_ROOT
    ? path.join(process.env.ARTCOVR_PRIVATE_ROOT, "direct-source-map.local.json")
    : null);
if (!existingMapPath) {
  throw new Error("Set ARTCOVR_EXISTING_SOURCE_MAP or ARTCOVR_PRIVATE_ROOT to the existing private source map.");
}
const outputPath = path.join(batchRoot, "direct-source-map.local.json");
const catalogIdPath = path.join(batchRoot, "owner-approved-catalog-ids.private.json");
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const plan = JSON.parse(await readFile(planPath, "utf8")) as {
  candidates: Array<{ candidate: string; sourcePath: string; sha256: string }>;
};
const existing = JSON.parse(await readFile(existingMapPath, "utf8")) as Array<{
  id: string;
  sha256: string;
  sourceAbsolutePath: string;
}>;
if (plan.candidates.length !== 38) throw new Error("Expected the exact 38-work owner-approved batch.");

const byId = new Map(existing.map((entry) => [entry.id, entry]));
const hashes = new Set(existing.map((entry) => entry.sha256));
const addedIds: string[] = [];
for (const candidate of plan.candidates) {
  const bytes = await readFile(candidate.sourcePath);
  const actualSha = sha256(bytes);
  if (actualSha !== candidate.sha256) throw new Error(`${candidate.candidate}: source SHA-256 mismatch.`);
  if (hashes.has(actualSha)) throw new Error(`${candidate.candidate}: source SHA already exists in the private map.`);
  const id = `art_${actualSha.slice(0, 20)}`;
  if (byId.has(id)) throw new Error(`${candidate.candidate}: catalog id already exists in the private map.`);
  const entry = { id, sha256: actualSha, sourceAbsolutePath: candidate.sourcePath };
  byId.set(id, entry);
  hashes.add(actualSha);
  addedIds.push(id);
}

const merged = [...byId.values()].sort((left, right) => left.id.localeCompare(right.id, "en"));
const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(merged, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
try {
  await rename(temporaryPath, outputPath);
} catch (error) {
  await rm(temporaryPath, { force: true });
  throw error;
}
await writeFile(catalogIdPath, `${JSON.stringify(addedIds.sort(), null, 2)}\n`, "utf8");
console.log(JSON.stringify({ existing: existing.length, added: 38, total: merged.length, outputPath, catalogIdPath }, null, 2));
