/**
 * Regenerates the 2026-08-14 collection-rescore swap specs and emits
 * src/lib/artcovr/launch-selection.PROPOSED.ts.
 *
 * Positions 1-17 are carried over byte-for-byte from the committed selection.
 * Positions 18-100 are replaced by the rescore picks, ordered by score.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchSelection } from "../../../src/lib/artcovr/launch-selection.ts";
import { EXCLUDED_LAUNCH_SOURCE_HASHES } from "../../../src/lib/artcovr/catalog-review.ts";
import { REGENERATION_REQUIRED_SOURCE_HASHES } from "../../../src/lib/artcovr/source-exclusions.ts";

type Ev = {
  replaces: string; sourceFile: string; sha256: string; slug: string; title: string;
  category: string; moodTags: string[]; description: string; series: string;
  _score: number; _strength: number; _sourcePool: string; _sourcePath: string;
  _replacesPosition: number; _replacesPriceCents: number; _replacesSaleMode: string;
};

const ROOT = process.cwd();
const EVIDENCE = "E:\\ART_COLLECTION\\.artcovr-scoring\\swap-evidence.json";
const STAGE = path.join(ROOT, "outputs", "catalog", "regen-picks-2026-08-14");

const works: Ev[] = JSON.parse(await readFile(EVIDENCE, "utf8"));
works.sort((a, b) => a._replacesPosition - b._replacesPosition);

const POOL: Record<string, string> = {
  concept_reference_art: "concept_reference_art",
  "NEW META IMAGES": "new_meta_images",
  generated_images: "generated_images",
};

// ---- blocklist gate -------------------------------------------------------
const blocked = works.filter(
  (w) => REGENERATION_REQUIRED_SOURCE_HASHES.has(w.sha256) || EXCLUDED_LAUNCH_SOURCE_HASHES.has(w.sha256),
);
if (blocked.length > 0) throw new Error(`blocklisted picks still present: ${blocked.map((w) => w.slug).join(", ")}`);
console.log("blocklist gate: clean");

// ---- collision gate against the retained head -----------------------------
const head = launchSelection.slice(0, 17);
const headHashes = new Set(head.map((s) => s.sourceSha256).filter(Boolean) as string[]);
const collide = works.filter((w) => headHashes.has(w.sha256));
console.log("collides with kept 1-17:", collide.length);

if (works.length !== 83) throw new Error(`expected 83 works, got ${works.length}`);
if (works[0]._replacesPosition !== 18 || works[82]._replacesPosition !== 100) throw new Error("position span wrong");

// ---- swap specs, partitioned by (sourcePool, mime) ------------------------
const REVIEW_FLAGS = [
  "owner_direct_use_pool_source",
  "machine_scored_style_and_rarity_rank_2026-08-14",
  "independent_visual_gate_passed_no_visible_text_logo_watermark_likeness_child_nudity_or_protected_character",
  "commercial_rights_unconfirmed",
  "owner_approval_required",
];
const SPEC_ID = "2026-08-14-collection-rescore";
const spec = {
  schemaVersion: 2,
  swapId: SPEC_ID,
  date: "2026-08-14",
  directive:
    "Owner-directed rescore swap: every launch position from 18 to 100 is replaced by a higher-scoring work " +
    "selected from a full 294,036-image sweep of E:\\ART_COLLECTION. Positions 1-17 are untouched. Each " +
    "replacement inherits the removed work's launch position, priceCents and saleMode, so the price ladder and " +
    "the exclusive/repeatable split are unchanged. The 83 works are drawn from three owner-approved direct-use " +
    "pools, so each row carries its own sourcePool and sourceMimeType (schemaVersion 2).",
  removalReason: "collection_rescore_owner_directive_2026-08-14",
  sourcePool: "concept_reference_art",
  sourceDirectory: STAGE.replace(/\\/g, "/"),
  sourceMimeType: "image/png" as const,
  reviewFlags: REVIEW_FLAGS,
  provenanceNote:
    "Selection evidence in E:\\ART_COLLECTION\\.artcovr-scoring (features.jsonl, ranked.jsonl, model.json, " +
    "final83.json, swap-evidence.json, verify_*.jpg, before_after_*.jpg). Source bytes are unmodified originals " +
    "copied from the owner-approved direct-use pools; each file is named by its own SHA-256 prefix.",
  works: works.map((w) => ({
    replaces: w.replaces,
    sourceFile: w.sourceFile,
    sourcePool: POOL[w._sourcePool],
    sourceMimeType: w.sourceFile.endsWith(".png") ? "image/png" : "image/jpeg",
    sha256: w.sha256,
    slug: w.slug,
    title: w.title,
    category: w.category,
    moodTags: w.moodTags,
    description: w.description,
    series: w.series,
  })),
};
const specFile = path.join(ROOT, "catalog", "swaps", `${SPEC_ID}.json`);
await writeFile(specFile, JSON.stringify(spec, null, 2) + "\n", "utf8");
{
  const byPool = new Map<string, number>();
  for (const w of spec.works) byPool.set(w.sourcePool, (byPool.get(w.sourcePool) ?? 0) + 1);
  console.log("spec:", SPEC_ID, spec.works.length, "works;", [...byPool].map(([k, v]) => `${k}=${v}`).join(" "));
}

// ---- launch-selection.PROPOSED.ts ----------------------------------------
const lit = (v: unknown) => JSON.stringify(v);
const entry = (w: Ev) =>
  `  { sourcePool: ${lit(POOL[w._sourcePool])}, sourceSha256: ${lit(w.sha256)}, category: ${lit(w.category)}, ` +
  `moodTags: [${w.moodTags.map(lit).join(", ")}], reviewFlags: RESCORE_2026_08_14_REVIEW_FLAGS },` +
  `  // ${String(w._replacesPosition).padStart(3)}  ${w.slug}`;

const original = await readFile(path.join(ROOT, "src", "lib", "artcovr", "launch-selection.ts"), "utf8");
const MARKER = /export const launchSelection\s*:\s*readonly LaunchSelection\[\]\s*=\s*withReplacements\([\s\S]*?\);/;
if (!MARKER.test(original)) throw new Error("composition marker not found - launch-selection.ts changed shape");

const replacement = `/**
 * Owner-approved review flags for the 2026-08-14 collection rescore. Every row
 * below was machine-ranked against a full sweep of the source collection and
 * then passed an independent visual gate; rights remain unconfirmed.
 */
export const RESCORE_2026_08_14_REVIEW_FLAGS: readonly string[] = [
${REVIEW_FLAGS.map((f) => `  ${lit(f)},`).join("\n")}
];

/** The pre-rescore composition, retained so slots 1-17 stay byte-identical. */
const legacyLaunchSelection: readonly LaunchSelection[] = withReplacements(
  retainedLaunchSelection,
  regeneratedOriginalReplacements,
);

/**
 * Launch slots 18-100, in position order. Selected 2026-08-14 from a
 * 294,036-image scored sweep; see E:\\ART_COLLECTION\\.artcovr-scoring.
 */
const rescoreLaunchSelection: readonly LaunchSelection[] = [
${works.map(entry).join("\n")}
];

export const launchSelection: readonly LaunchSelection[] = [
  ...legacyLaunchSelection.slice(0, 17),
  ...rescoreLaunchSelection,
];`;

const proposed = original.replace(MARKER, replacement);
const out = path.join(ROOT, "src", "lib", "artcovr", "launch-selection.PROPOSED.ts");
await writeFile(out, proposed, "utf8");
console.log("wrote", path.relative(ROOT, out), "-", proposed.split("\n").length, "lines");
console.log("head kept:", head.length, "rescore:", works.length, "total:", head.length + works.length);
