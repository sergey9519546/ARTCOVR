import {
  getArtworkDiscoveryKeywords,
  getArtworkGenres,
  type Artwork,
} from "./artworks.ts";
import { displayGenreLabel } from "./genre-index.ts";
import {
  getVisualDescriptorGroups,
  getVisualEntry,
  visualIndex,
  type VisualDescriptor,
  type VisualRelated,
} from "./visual-index.ts";

export const CATALOG_INTELLIGENCE_VERSION = "artcovr-catalog-intelligence-v1";

export const INTELLIGENCE_PAYLOAD_CONTRACT = {
  metadataChunks: "chunks/metadata_0000.js … chunks/metadata_0022.js",
  fasttextPredictions: "fasttext_predictions.js",
  fasttextIndex: "fasttext_index.js",
  fasttextStats: "fasttext_stats.js",
  fasttextAnalysis: "fasttext_analysis.js",
  searchIndex: "search_index.js",
  embeddings: "embeddings.js",
  similar: "similar.js",
  duplicates: "duplicates.js",
} as const;

export type CatalogFacetKey = "genre" | "color" | "mood" | "style";

export type CatalogIntelligenceRecord = {
  slug: string;
  assetKey: string;
  title: string;
  source: "approved-public" | "private-staging";
  genres: ReturnType<typeof getArtworkGenres>;
  genreLabels: string[];
  colors: string[];
  moods: string[];
  keywords: string[];
  visualDescriptors: VisualDescriptor[];
  related: VisualRelated[];
  vector: {
    dimensions: number;
    hasDerivedSimilarity: boolean;
  };
};

export type CatalogFacetIndex = {
  records: Map<string, CatalogIntelligenceRecord>;
  postings: Record<CatalogFacetKey, Map<string, Set<string>>>;
  counts: Record<CatalogFacetKey, Map<string, number>>;
};

export type CatalogIntelligenceSummary = {
  version: string;
  totalWorks: number;
  indexedWorks: number;
  visualDimensions: number;
  relatedEdges: number;
  facets: Record<CatalogFacetKey, Array<{ value: string; count: number }>>;
};

export type ExternalPayloadReadiness = {
  mode: "native-approved-projection" | "external-payload-ready";
  available: string[];
  missing: string[];
  message: string;
};

const MOOD_LABELS = new Set([
  "Vibrant__Energetic",
  "Melancholic__Solitary",
  "Majestic__Epic",
  "Eerie__Dark",
  "Mysterious__Dreamy",
  "Serene__Peaceful",
]);

const EMOTIONAL_MOOD_TAGS = new Set([
  "dreamlike",
  "quiet",
  "monumental",
  "solitary",
  "nocturnal",
  "uncanny",
  "macabre",
]);

function getBlendColor(value?: string) {
  if (!value) return null;
  if (value.includes("Teal")) return "Teal";
  if (value.includes("Earth")) return "Brown";
  if (value.includes("Pastel")) return "Pink";
  return null;
}

export function getArtworkColors(artwork: Artwork): string[] {
  const visualEntry = getVisualEntry(artwork.slug);
  const dominantColor = visualEntry?.labels.domcolor?.label ?? artwork.accentColor ?? null;
  const blendColor = getBlendColor(visualEntry?.labels.colorblend?.label);
  return [...new Set([dominantColor, blendColor].filter((value): value is string => Boolean(value)))];
}

export function getArtworkMoods(artwork: Artwork): string[] {
  const visualMood = getVisualEntry(artwork.slug)?.labels.mood?.label;
  const taggedMoods = artwork.moodTags.filter((tag) => EMOTIONAL_MOOD_TAGS.has(tag));
  return [...new Set([visualMood, ...taggedMoods].filter((value): value is string => Boolean(value)))];
}

function assetKeyFor(artwork: Artwork) {
  return artwork.image.split("/").pop() ?? artwork.image;
}

export function getCatalogIntelligenceRecord(artwork: Artwork): CatalogIntelligenceRecord {
  const genres = getArtworkGenres(artwork);
  const visualDescriptors = getVisualDescriptorGroups(artwork.slug);
  const visualEntry = getVisualEntry(artwork.slug);
  return {
    slug: artwork.slug,
    assetKey: assetKeyFor(artwork),
    title: artwork.title,
    source: artwork.rightsApproved && artwork.published ? "approved-public" : "private-staging",
    genres,
    genreLabels: genres.map(displayGenreLabel),
    colors: getArtworkColors(artwork),
    moods: getArtworkMoods(artwork),
    keywords: [...new Set(getArtworkDiscoveryKeywords(artwork))],
    visualDescriptors,
    related: visualEntry?.related ?? [],
    vector: {
      dimensions: visualIndex.dimensions,
      hasDerivedSimilarity: Boolean(visualEntry?.related.length),
    },
  };
}

export function buildCatalogFacetIndex(items: readonly Artwork[]): CatalogFacetIndex {
  const records = new Map<string, CatalogIntelligenceRecord>();
  const postings: CatalogFacetIndex["postings"] = {
    genre: new Map(),
    color: new Map(),
    mood: new Map(),
    style: new Map(),
  };

  for (const artwork of items) {
    const record = getCatalogIntelligenceRecord(artwork);
    records.set(record.slug, record);
    const values: Record<CatalogFacetKey, string[]> = {
      genre: record.genres,
      color: record.colors,
      mood: record.moods,
      style: record.visualDescriptors
        .filter((descriptor) => descriptor.task === "style")
        .map((descriptor) => descriptor.label),
    };
    for (const facet of Object.keys(values) as CatalogFacetKey[]) {
      for (const value of values[facet]) {
        const bucket = postings[facet].get(value) ?? new Set<string>();
        bucket.add(record.slug);
        postings[facet].set(value, bucket);
      }
    }
  }

  const counts: CatalogFacetIndex["counts"] = {
    genre: new Map([...postings.genre].map(([value, slugs]) => [value, slugs.size])),
    color: new Map([...postings.color].map(([value, slugs]) => [value, slugs.size])),
    mood: new Map([...postings.mood].map(([value, slugs]) => [value, slugs.size])),
    style: new Map([...postings.style].map(([value, slugs]) => [value, slugs.size])),
  };

  return { records, postings, counts };
}

export function summarizeCatalogIntelligence(index: CatalogFacetIndex): CatalogIntelligenceSummary {
  const facetSummary = (facet: CatalogFacetKey) =>
    [...index.counts[facet]]
      .map(([value, count]) => ({ value, count }))
      .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value));
  const records = [...index.records.values()];
  return {
    version: CATALOG_INTELLIGENCE_VERSION,
    totalWorks: records.length,
    indexedWorks: records.filter((record) => record.visualDescriptors.length > 0).length,
    visualDimensions: records[0]?.vector.dimensions ?? visualIndex.dimensions,
    relatedEdges: records.reduce((total, record) => total + record.related.length, 0),
    facets: {
      genre: facetSummary("genre"),
      color: facetSummary("color"),
      mood: facetSummary("mood"),
      style: facetSummary("style"),
    },
  };
}

export function intersectCatalogFacetSlugs(
  index: CatalogFacetIndex,
  view: Partial<Record<CatalogFacetKey, string | null>>,
) {
  const activeSets = (Object.keys(view) as CatalogFacetKey[])
    .map((facet) => {
      const value = view[facet];
      return value ? index.postings[facet].get(value) ?? new Set<string>() : null;
    })
    .filter((set): set is Set<string> => Boolean(set));

  if (activeSets.length === 0) return null;
  activeSets.sort((left, right) => left.size - right.size);
  return new Set([...activeSets[0]].filter((slug) => activeSets.every((set) => set.has(slug))));
}

export function getExternalPayloadReadiness(
  availablePayloads: readonly string[] = [],
): ExternalPayloadReadiness {
  const available = new Set(availablePayloads);
  const required = Object.values(INTELLIGENCE_PAYLOAD_CONTRACT);
  const missing = required.filter((payload) => !available.has(payload));
  if (missing.length === 0) {
    return {
      mode: "external-payload-ready",
      available: [...required],
      missing: [],
      message: "All referenced gallery payload families are available for validation.",
    };
  }
  return {
    mode: "native-approved-projection",
    available: required.filter((payload) => available.has(payload)),
    missing,
    message:
      "External viewer payloads are incomplete. ARTCOVR is using its approved projection and will not treat missing payloads as empty data.",
  };
}
