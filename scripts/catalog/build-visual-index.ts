import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Regenerates the committed visual index. NOT part of `npm run build`:
 * run it manually with `npm run catalog:visual-index` (add `-- --backend clip`
 * on a machine that can reach the CLIP weights, see ADR-014).
 *
 * The pixel maths lives in scripts/catalog/compute-visual-index.py (numpy +
 * Pillow); this script owns validation and deterministic persistence:
 *
 *   src/lib/artcovr/visual-index.json    shipped: related + diversityRank + labels
 *   src/lib/artcovr/visual-vectors.json  audit/regeneration only, never imported
 *                                        by site code (bundle weight).
 */
const projectRoot = path.resolve(import.meta.dirname, "../..");
const flagIndex = process.argv.findIndex((argument) => argument === "--backend");
const inlineBackend = process.argv
  .find((argument) => argument.startsWith("--backend="))
  ?.slice("--backend=".length);
const backend = inlineBackend ?? (flagIndex === -1 ? "descriptor" : process.argv[flagIndex + 1] ?? "");
if (backend !== "descriptor" && backend !== "clip") {
  throw new Error(`Unknown backend '${backend}': expected 'descriptor' or 'clip'.`);
}

const RELATED_COUNT = 6;
const VECTOR_DIMENSIONS = 512;
const TASKS = ["style", "medium", "mood", "category", "weather", "colorblend", "domcolor"] as const;
// Mirrors BANNED_KEYWORD_TERMS in tests/unit/catalog-curation.test.ts.
const BANNED_LABEL_TERMS = [
  "masterpiece",
  "best quality",
  "award winning",
  "trending",
  "viral",
  "4k",
  "8k",
  "ultra hd",
  "ai art",
  "ai-generated",
  "prompt",
];

type Related = { slug: string; score: number };
type Label = { label: string; conf: number };
type PayloadWork = {
  vector: number[];
  related: Related[];
  diversityRank: number;
  labels: Record<string, Label>;
};
type Payload = {
  backend: string;
  vectorVersion: string;
  labelVersion: string;
  dimensions: number;
  works: Record<string, PayloadWork>;
};

const readJson = async <T>(relativePath: string): Promise<T> =>
  JSON.parse(await readFile(path.join(projectRoot, relativePath), "utf8")) as T;

const catalog = await readJson<Array<{ slug: string }>>("src/lib/artcovr/curated-public.json");
const vocabularies = await readJson<{ tasks: Record<string, { labels: string[] }> }>(
  "scripts/catalog/fasttext-vocabularies.json",
);
const catalogSlugs = catalog.map(({ slug }) => slug).sort();

const workingDirectory = mkdtempSync(path.join(tmpdir(), "artcovr-visual-"));
const payloadPath = path.join(workingDirectory, "payload.json");
let payload: Payload;
try {
  const compute = spawnSync(
    process.env.PYTHON ?? "python3",
    [
      path.join(projectRoot, "scripts", "catalog", "compute-visual-index.py"),
      "--root",
      projectRoot,
      "--out",
      payloadPath,
      "--backend",
      backend,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  if (compute.status !== 0) {
    throw new Error(`compute-visual-index.py failed with exit code ${compute.status}`);
  }
  payload = JSON.parse(await readFile(payloadPath, "utf8")) as Payload;
} finally {
  rmSync(workingDirectory, { recursive: true, force: true });
}

const slugs = Object.keys(payload.works).sort();
if (slugs.length !== catalogSlugs.length || slugs.some((slug, index) => slug !== catalogSlugs[index])) {
  throw new Error("Visual index slugs must match the public catalog projection exactly.");
}
if (payload.dimensions !== VECTOR_DIMENSIONS) {
  throw new Error(`Expected ${VECTOR_DIMENSIONS}-d vectors, got ${payload.dimensions}.`);
}

const ranks = new Set<number>();
for (const slug of slugs) {
  const work = payload.works[slug];
  if (work.vector.length !== VECTOR_DIMENSIONS) {
    throw new Error(`${slug}: expected ${VECTOR_DIMENSIONS} vector components.`);
  }
  const norm = Math.sqrt(work.vector.reduce((total, value) => total + value * value, 0));
  if (Math.abs(norm - 1) > 1e-3) throw new Error(`${slug}: vector is not L2-normalized (norm ${norm}).`);

  if (work.related.length !== RELATED_COUNT) {
    throw new Error(`${slug}: expected ${RELATED_COUNT} related works, got ${work.related.length}.`);
  }
  const relatedSlugs = new Set<string>();
  for (const related of work.related) {
    if (related.slug === slug) throw new Error(`${slug}: related works must not self-reference.`);
    if (!catalogSlugs.includes(related.slug)) throw new Error(`${slug}: unknown related slug ${related.slug}.`);
    if (relatedSlugs.has(related.slug)) throw new Error(`${slug}: duplicate related slug ${related.slug}.`);
    relatedSlugs.add(related.slug);
  }

  if (!Number.isInteger(work.diversityRank) || work.diversityRank < 0 || work.diversityRank >= slugs.length) {
    throw new Error(`${slug}: diversityRank ${work.diversityRank} out of range.`);
  }
  if (ranks.has(work.diversityRank)) throw new Error(`Duplicate diversityRank ${work.diversityRank}.`);
  ranks.add(work.diversityRank);

  for (const task of TASKS) {
    const label = work.labels[task];
    if (!label) throw new Error(`${slug}: missing '${task}' label.`);
    if (!vocabularies.tasks[task].labels.includes(label.label)) {
      throw new Error(`${slug}: '${label.label}' is not in the ${task} vocabulary.`);
    }
    if (!(label.conf > 0) || label.conf > 1) throw new Error(`${slug}: ${task} confidence must be in (0, 1].`);
    const normalized = label.label.toLowerCase();
    if (BANNED_LABEL_TERMS.some((banned) => normalized.includes(banned))) {
      throw new Error(`${slug}: label '${label.label}' matches a governance-banned term.`);
    }
  }
}
if (ranks.size !== slugs.length) throw new Error("diversityRank must be a permutation of 0..n-1.");

const indexArtifact = {
  version: payload.vectorVersion,
  labelVersion: payload.labelVersion,
  backend: payload.backend,
  generatedFrom: "public/assets/artworks display derivatives",
  vocabularySource: "scripts/catalog/fasttext-vocabularies.json",
  vectorArtifact: "src/lib/artcovr/visual-vectors.json",
  dimensions: payload.dimensions,
  works: Object.fromEntries(
    slugs.map((slug) => [
      slug,
      {
        related: payload.works[slug].related,
        diversityRank: payload.works[slug].diversityRank,
        labels: Object.fromEntries(TASKS.map((task) => [task, payload.works[slug].labels[task]])),
      },
    ]),
  ),
};

const vectorArtifact = {
  version: payload.vectorVersion,
  backend: payload.backend,
  generatedFrom: "public/assets/artworks display derivatives",
  dimensions: payload.dimensions,
  note: "Audit and regeneration only. Site code must never import this file: 100 x 512 floats would ship in the client bundle.",
  vectors: Object.fromEntries(slugs.map((slug) => [slug, payload.works[slug].vector])),
};

await writeFile(
  path.join(projectRoot, "src", "lib", "artcovr", "visual-index.json"),
  `${JSON.stringify(indexArtifact, null, 2)}\n`,
  "utf8",
);
await writeFile(
  path.join(projectRoot, "src", "lib", "artcovr", "visual-vectors.json"),
  `${JSON.stringify(vectorArtifact, null, 2)}\n`,
  "utf8",
);

console.log(
  JSON.stringify({
    works: slugs.length,
    backend: payload.backend,
    vectorVersion: payload.vectorVersion,
    labelVersion: payload.labelVersion,
  }),
);
