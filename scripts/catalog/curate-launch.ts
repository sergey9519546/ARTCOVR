import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSearchText,
  containsLegacyBranding,
  launchSelection,
  normalizeStyleProfile,
  type DirectSourcePool,
} from "../../src/lib/artcovr/launch-selection.ts";
import { REGENERATION_REQUIRED_SOURCES } from "../../src/lib/artcovr/source-exclusions.ts";

type GeneratedCandidate = {
  id: string;
  ordinal: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  sourceAbsolutePath: string;
  sourceFormat: "png" | "jpeg";
  sourceMimeType: "image/png" | "image/jpeg";
  alt: string;
  sourcePrompt: string;
  sourceManifest: string;
  validationStatus: "technical-pass" | "rejected";
  validationIssues: string[];
};

type StyleProfile = Record<string, unknown> & {
  identity: {
    ordinal: number;
    style_id: string;
    name: string;
    primary_family: string;
  };
  visual_language: {
    palette?: string[];
    lighting?: string;
    linework_and_edges?: string | { value?: string };
    medium_and_texture?: string;
    composition_and_motion?: string;
  };
  generation: {
    keywords?: string[];
    avoids?: string[];
    prompt_templates?: Record<string, string>;
  };
  quality?: { quality_flags?: string[] };
};

type MetaRecord = {
  absolutePath: string;
  sourcePool: "new_meta_images" | "meta_updated_images";
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  detectedFormat: "png" | "jpeg" | "webp";
  mimeType: string;
  title: string;
  subject: string;
  prompt: null;
  keywords: string[];
  metadata: Record<string, unknown>;
  visualReview: Record<string, unknown>;
  rights: Record<string, unknown>;
};

type ReviewedRecord = {
  path: string;
  title: string;
  prompt: string | null;
  keywords: string[];
  palette_hex: string[];
  width: number;
  height: number;
  bytes: number;
  format: string;
  sha256: string;
  metadata_linkage: Record<string, unknown>;
  confidence: Record<string, unknown>;
  rights_flags: string[];
};

type NormalizedSource = {
  sourcePool: DirectSourcePool;
  sourceAbsolutePath: string;
  sourceOrdinal: number | null;
  sourceSlug: string | null;
  title: string;
  description: string;
  alt: string;
  prompt: string | null;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  keywords: string[];
  avoids: string[];
  palette: string[];
  lighting: string;
  lineworkAndEdges: string;
  mediumAndTexture: string;
  compositionAndMotion: string;
  promptTemplates: Record<string, string>;
  qualityFlags: string[];
  styleProfile: Record<string, unknown> | null;
  sourceMetadata: Record<string, unknown>;
  sourceReviewFlags: string[];
};

type CuratedRecord = {
  id: string;
  slug: string;
  title: string;
  displayPath: string;
  alt: string;
  description: string;
  category: string;
  moodTags: string[];
  reviewFlags: string[];
  sha256: string;
  sourcePool: DirectSourcePool;
  rightsApproved: boolean;
  [key: string]: unknown;
};

type PrivateSourceRecord = {
  id: string;
  sha256: string;
  sourceAbsolutePath: string;
};

const prohibitedGeneratedCategory = "Photography / Cinematic / Editorial";
const prohibitedGeneratedTerms = /\b(?:film[ -]?noir|noir|realism|realist|photoreal(?:ism|istic)?)\b/i;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "../..");
const curationRoot = process.env.ARTCOVR_CURATION_ROOT
  ? path.resolve(process.env.ARTCOVR_CURATION_ROOT)
  : "E:\\ART_COLLECTION\\.artcovr-curation";
const profileRoot = process.env.ARTCOVR_STYLE_PROFILE_ROOT
  ? path.resolve(process.env.ARTCOVR_STYLE_PROFILE_ROOT)
  : "E:\\ART_COLLECTION\\132_art_styles\\132_art_style_json_library_v3\\styles";
const privateRoot = process.env.ARTCOVR_PRIVATE_ROOT
  ? path.resolve(process.env.ARTCOVR_PRIVATE_ROOT)
  : "E:\\ART_COLLECTION\\.artcovr-private";

const generatedCandidates = JSON.parse(
  await readFile(path.join(projectRoot, "catalog", "candidates.json"), "utf8"),
) as GeneratedCandidate[];
const metaPayload = JSON.parse(
  await readFile(path.join(curationRoot, "meta_sources_shortlist.json"), "utf8"),
) as { records: MetaRecord[] };
const conceptPayload = JSON.parse(
  await readFile(path.join(curationRoot, "concept-reference-shortlist.json"), "utf8"),
) as { shortlist: ReviewedRecord[] };
const downloadPayload = JSON.parse(
  await readFile(path.join(curationRoot, "new-download-shortlist.json"), "utf8"),
) as { shortlist: ReviewedRecord[] };

const generatedByOrdinal = new Map(
  generatedCandidates.map((candidate) => [candidate.ordinal, candidate]),
);
const metaByHash = new Map(metaPayload.records.map((record) => [record.sha256, record]));
const conceptByHash = new Map(conceptPayload.shortlist.map((record) => [record.sha256, record]));
const downloadByHash = new Map(downloadPayload.shortlist.map((record) => [record.sha256, record]));

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mimeFromFormat(format: string): NormalizedSource["mimeType"] {
  const normalized = format.toLowerCase();
  if (normalized.includes("png")) return "image/png";
  if (normalized.includes("webp")) return "image/webp";
  return "image/jpeg";
}

async function normalizeGenerated(ordinal: number): Promise<NormalizedSource> {
  const candidate = generatedByOrdinal.get(ordinal);
  if (!candidate) throw new Error(`Missing generated candidate #${ordinal}.`);
  if (candidate.validationStatus !== "technical-pass") {
    throw new Error(`Generated candidate #${ordinal} is not technically valid.`);
  }

  const profilePath = path.join(
    profileRoot,
    `${String(candidate.ordinal).padStart(3, "0")}_${candidate.slug}.json`,
  );
  const rawProfile = JSON.parse(await readFile(profilePath, "utf8")) as StyleProfile;
  if (
    rawProfile.identity.ordinal !== candidate.ordinal ||
    rawProfile.identity.style_id !== candidate.slug ||
    rawProfile.identity.name !== candidate.title ||
    rawProfile.identity.primary_family !== candidate.category
  ) {
    throw new Error(`Style metadata does not join 1:1 for #${ordinal}.`);
  }
  const linework =
    typeof rawProfile.visual_language.linework_and_edges === "string"
      ? rawProfile.visual_language.linework_and_edges
      : rawProfile.visual_language.linework_and_edges?.value ?? "";
  const strictMetadataFields = [
    candidate.title,
    candidate.category,
    candidate.description,
    candidate.sourcePrompt,
    ...(rawProfile.generation.keywords ?? []),
  ].join(" | ");
  if (
    candidate.category === prohibitedGeneratedCategory ||
    prohibitedGeneratedTerms.test(strictMetadataFields)
  ) {
    throw new Error(`Generated candidate #${ordinal} failed the strict non-photo/non-noir gate.`);
  }

  return {
    sourcePool: "generated_images",
    sourceAbsolutePath: candidate.sourceAbsolutePath,
    sourceOrdinal: candidate.ordinal,
    sourceSlug: candidate.slug,
    title: candidate.title,
    description: candidate.description,
    alt: candidate.alt,
    prompt: candidate.sourcePrompt,
    width: candidate.width,
    height: candidate.height,
    bytes: candidate.bytes,
    sha256: candidate.sha256,
    mimeType: candidate.sourceMimeType,
    keywords: rawProfile.generation.keywords ?? [],
    avoids: rawProfile.generation.avoids ?? [],
    palette: rawProfile.visual_language.palette ?? [],
    lighting: rawProfile.visual_language.lighting ?? "",
    lineworkAndEdges: linework,
    mediumAndTexture: rawProfile.visual_language.medium_and_texture ?? "",
    compositionAndMotion: rawProfile.visual_language.composition_and_motion ?? "",
    promptTemplates: rawProfile.generation.prompt_templates ?? {},
    qualityFlags: rawProfile.quality?.quality_flags ?? [],
    styleProfile: normalizeStyleProfile(rawProfile),
    sourceMetadata: {
      confidence: "high: exact ordinal, style id, title, family, and source manifest join",
      sourceManifest: "generated_images/style_library_manifest.json",
      sourceProfile: `132_art_styles/132_art_style_json_library_v3/styles/${path.basename(profilePath)}`,
      promptStatus: "source supplied by the exact style-profile and manifest join",
      provider: null,
      model: null,
    },
    sourceReviewFlags: [],
  };
}

function normalizeMeta(record: MetaRecord): NormalizedSource {
  return {
    sourcePool: record.sourcePool,
    sourceAbsolutePath: record.absolutePath,
    sourceOrdinal: null,
    sourceSlug: null,
    title: record.title,
    description: record.subject,
    alt: record.subject,
    prompt: null,
    width: record.width,
    height: record.height,
    bytes: record.bytes,
    sha256: record.sha256,
    mimeType: mimeFromFormat(record.mimeType),
    keywords: record.keywords,
    avoids: [],
    palette: [],
    lighting: "",
    lineworkAndEdges: "",
    mediumAndTexture: "",
    compositionAndMotion: "",
    promptTemplates: {},
    qualityFlags: [],
    styleProfile: null,
    sourceMetadata: {
      confidence: record.metadata.overallConfidence ?? "technical fields high; curator labels medium-high",
      promptStatus: "unavailable; not reconstructed",
      provider: "Meta AI (collection-lineage claim)",
      model: null,
    },
    sourceReviewFlags: [],
  };
}

function normalizeReviewed(
  sourcePool: "concept_reference_art" | "new_download_root",
  record: ReviewedRecord,
): NormalizedSource {
  return {
    sourcePool,
    sourceAbsolutePath: record.path,
    sourceOrdinal: null,
    sourceSlug: null,
    title: record.title,
    description: record.keywords.join(", "),
    alt: `${record.title}: ${record.keywords.slice(0, 5).join(", ")}.`,
    prompt: record.prompt,
    width: record.width,
    height: record.height,
    bytes: record.bytes,
    sha256: record.sha256,
    mimeType: mimeFromFormat(record.format),
    keywords: record.keywords,
    avoids: [],
    palette: record.palette_hex,
    lighting: "",
    lineworkAndEdges: "",
    mediumAndTexture: "",
    compositionAndMotion: "",
    promptTemplates: {},
    qualityFlags: [],
    styleProfile: null,
    sourceMetadata: {
      confidence: record.confidence,
      linkage: record.metadata_linkage,
      promptStatus: record.prompt === null ? "unavailable; not reconstructed" : "source supplied",
      provider: null,
      model: null,
    },
    sourceReviewFlags: record.rights_flags,
  };
}

const curated: CuratedRecord[] = [];
const privateSourceMap: PrivateSourceRecord[] = [];
for (const [position, selection] of launchSelection.entries()) {
  let source: NormalizedSource;
  if (selection.sourcePool === "generated_images") {
    if (!selection.sourceOrdinal) throw new Error("Generated selection is missing sourceOrdinal.");
    source = await normalizeGenerated(selection.sourceOrdinal);
  } else if (
    selection.sourcePool === "new_meta_images" ||
    selection.sourcePool === "meta_updated_images"
  ) {
    const record = metaByHash.get(selection.sourceSha256 ?? "");
    if (!record || record.sourcePool !== selection.sourcePool) {
      throw new Error(`Missing ${selection.sourcePool} shortlist hash ${selection.sourceSha256}.`);
    }
    source = normalizeMeta(record);
  } else if (selection.sourcePool === "concept_reference_art") {
    const record = conceptByHash.get(selection.sourceSha256 ?? "");
    if (!record) throw new Error(`Missing concept shortlist hash ${selection.sourceSha256}.`);
    source = normalizeReviewed("concept_reference_art", record);
  } else {
    const record = downloadByHash.get(selection.sourceSha256 ?? "");
    if (!record) throw new Error(`Missing download shortlist hash ${selection.sourceSha256}.`);
    source = normalizeReviewed("new_download_root", record);
  }

  if (source.width !== source.height || source.width < 1024 || source.bytes <= 0) {
    throw new Error(`Selected source failed the square technical gate: ${source.sha256}.`);
  }
  if (source.keywords.length === 0) {
    throw new Error(`Selected source has no linked review keywords: ${source.sha256}.`);
  }

  const id = `art_${source.sha256.slice(0, 20)}`;
  const slug = slugify(source.title);
  const displayPath = `/assets/artworks/${slug}.jpg`;
  const reviewFlags = [...new Set([...selection.reviewFlags, ...source.sourceReviewFlags])];
  const searchText = buildSearchText({
    title: source.title,
    description: source.description,
    category: selection.category,
    moodTags: selection.moodTags,
    keywords: source.keywords,
    palette: source.palette,
    lighting: source.lighting,
    mediumAndTexture: source.mediumAndTexture,
  });
  const record = {
    id,
    position: position + 1,
    slug,
    title: source.title,
    description: source.description,
    alt: source.alt,
    category: selection.category,
    mood: selection.moodTags.join(", "),
    moodTags: [...selection.moodTags],
    reviewFlags,
    width: source.width,
    height: source.height,
    bytes: source.bytes,
    sha256: source.sha256,
    sourcePool: source.sourcePool,
    sourceOrdinal: source.sourceOrdinal,
    sourceMimeType: source.mimeType,
    sourcePrompt: source.prompt,
    privateBasePath: `artworks/${id}/base`,
    displayPath,
    validationStatus: "technical-pass" as const,
    validationIssues: [],
    rightsApproved: false,
    published: false,
    metadata: {
      styleId: source.sourceSlug,
      styleFamily: selection.category,
      keywords: source.keywords,
      avoids: source.avoids,
      palette: source.palette,
      lighting: source.lighting,
      lineworkAndEdges: source.lineworkAndEdges,
      mediumAndTexture: source.mediumAndTexture,
      compositionAndMotion: source.compositionAndMotion,
      promptTemplates: source.promptTemplates,
      qualityFlags: source.qualityFlags,
      styleProfile: source.styleProfile,
      provenance: source.sourceMetadata,
      searchText,
      searchVector: { status: "derived_on_database_import", type: "postgres_tsvector" },
      semanticEmbedding: { status: "not_generated", model: null, dimensions: null, vector: null },
    },
  };
  if (containsLegacyBranding(record)) {
    throw new Error(`Selected source ${source.sha256} contains prohibited branding.`);
  }
  curated.push(record);
  privateSourceMap.push({ id, sha256: source.sha256, sourceAbsolutePath: source.sourceAbsolutePath });
}

const hashes = new Set(curated.map(({ sha256 }) => sha256));
const slugs = new Set(curated.map(({ slug }) => slug));
if (
  curated.length === 0 ||
  curated.length !== launchSelection.length ||
  hashes.size !== curated.length ||
  slugs.size !== curated.length
) {
  throw new Error("Curated catalog must contain one unique hash and slug for every launch selection.");
}

const selectedGeneratedOrdinals = new Set(
  launchSelection.flatMap(({ sourceOrdinal }) => (sourceOrdinal ? [sourceOrdinal] : [])),
);
const excluded = generatedCandidates
  .filter(({ ordinal }) => !selectedGeneratedOrdinals.has(ordinal))
  .map(({ id, ordinal, slug, title, sha256 }) => ({
    id,
    sourcePool: "generated_images",
    ordinal,
    slug,
    title,
    sha256,
    reason: "not_selected_for_launch_review",
  }));
const publicRecords = curated.map((record) => ({
  id: record.id,
  slug: record.slug,
  title: record.title,
  image: record.displayPath,
  alt: record.alt,
  description: record.description,
  category: record.category,
  moodTags: record.moodTags,
  editionAvailable: null,
  editionTotal: null,
  licenseLabel: null,
  saleMode: null,
  priceCents: null,
  rightsApproved: false,
  published: false,
  accentColor: "#0b0b0b",
}));

const outputs: Array<[string, unknown]> = [
  [path.join(projectRoot, "catalog", "curated-artworks.json"), curated],
  [path.join(projectRoot, "catalog", "excluded-candidates.json"), excluded],
  [path.join(privateRoot, "direct-source-map.local.json"), privateSourceMap],
  [path.join(projectRoot, "src", "lib", "artcovr", "curated-review.json"), publicRecords],
  [path.join(projectRoot, "supabase", "seed", "artworks.curated.metadata.json"), curated],
  [path.join(curationRoot, "regeneration-required-sources.json"), {
    policy: "Regenerated output must be a new file with a new SHA-256 and repeat visual, metadata, keyword, and rights review. Never overwrite or reuse an excluded identity.",
    sources: REGENERATION_REQUIRED_SOURCES,
  }],
];
await mkdir(privateRoot, { recursive: true });
for (const [outputPath, value] of outputs) {
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

console.log(
  JSON.stringify(
    {
      selected: curated.length,
      uniqueHashes: hashes.size,
      sourcePools: Object.fromEntries(
        [...new Set(curated.map(({ sourcePool }) => sourcePool))].map((sourcePool) => [
          sourcePool,
          curated.filter((record) => record.sourcePool === sourcePool).length,
        ]),
      ),
      rightsApproved: curated.filter(({ rightsApproved }) => rightsApproved).length,
      searchVectorStatus: "derived_on_database_import",
      semanticEmbeddingStatus: "not_generated",
      outputs: outputs.map(([outputPath]) => outputPath),
    },
    null,
    2,
  ),
);
