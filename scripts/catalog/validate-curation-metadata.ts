import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CuratedRecord = {
  title: string;
  description: string;
  alt: string;
  category: string;
  moodTags: string[];
  sourcePool: string;
  sha256: string;
  sourcePrompt: string | null;
  metadata: {
    keywords: string[];
    palette: string[];
    lighting: string;
    mediumAndTexture: string;
    compositionAndMotion: string;
    provenance: { promptStatus?: string };
    searchText: string;
    semanticEmbedding: { status: string; vector: unknown };
  };
};

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const records = JSON.parse(
  await readFile(path.join(projectRoot, "catalog", "curated-artworks.json"), "utf8"),
) as CuratedRecord[];

const failures: string[] = [];
for (const [index, record] of records.entries()) {
  const requiredStrings = [record.title, record.description, record.alt, record.category, record.metadata.searchText];
  if (requiredStrings.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    failures.push(`${index + 1}:missing-copy`);
  }
  if (!Array.isArray(record.moodTags) || record.moodTags.length < 3) failures.push(`${index + 1}:moods`);
  if (!Array.isArray(record.metadata.keywords) || record.metadata.keywords.length === 0) failures.push(`${index + 1}:keywords`);
  if (!Array.isArray(record.metadata.palette)) failures.push(`${index + 1}:palette-shape`);
  if (typeof record.metadata.lighting !== "string") failures.push(`${index + 1}:lighting-shape`);
  if (typeof record.metadata.mediumAndTexture !== "string") failures.push(`${index + 1}:texture-shape`);
  if (typeof record.metadata.compositionAndMotion !== "string") failures.push(`${index + 1}:composition-shape`);
  if (!record.metadata.provenance.promptStatus) failures.push(`${index + 1}:prompt-provenance`);
  if (record.metadata.semanticEmbedding.status !== "not_generated" || record.metadata.semanticEmbedding.vector !== null) {
    failures.push(`${index + 1}:invented-embedding`);
  }
}

const countBy = (values: string[]) =>
  Object.fromEntries([...new Set(values)].sort().map((value) => [value, values.filter((item) => item === value).length]));
const moodValues = records.flatMap(({ moodTags }) => moodTags);
const paletteCoverage = records.filter(({ metadata }) => metadata.palette.length > 0).length;
const generatedDetailCoverage = records.filter(
  ({ sourcePool, metadata }) =>
    sourcePool !== "generated_images" ||
    (metadata.lighting && metadata.mediumAndTexture && metadata.compositionAndMotion),
).length;

if (records.length !== 100) failures.push(`count:${records.length}`);
if (new Set(records.map(({ sha256 }) => sha256)).size !== 100) failures.push("duplicate-sha");
if (failures.length) throw new Error(`Curation metadata validation failed: ${failures.join(", ")}`);

console.log(JSON.stringify({
  records: records.length,
  categories: countBy(records.map(({ category }) => category)),
  topMoods: Object.entries(countBy(moodValues)).sort((a, b) => Number(b[1]) - Number(a[1])).slice(0, 15),
  paletteCoverage: `${paletteCoverage}/100 source-derived palettes available; absent values remain empty, never guessed`,
  lightingTextureCompositionShapeCoverage: `${generatedDetailCoverage}/100 (rich source fields on generated pool; explicit empty strings elsewhere)`,
  promptProvenance: "100/100",
  semanticEmbeddings: "0 invented; 100 explicitly not_generated",
}, null, 2));
