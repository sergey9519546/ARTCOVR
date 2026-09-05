import type { Artwork } from "./artworks.ts";
import { getVisualEntry } from "./visual-index.ts";

export const MUSIC_GENRES = [
  "ambient",
  "art-pop",
  "baroque-pop",
  "chamber-pop",
  "classical",
  "dream-pop",
  "electronic",
  "experimental",
  "hip-hop",
  "idm",
  "indie-rock",
  "industrial",
  "jazz",
  "minimal-techno",
  "neo-classical",
  "noise-rock",
  "post-punk",
  "psychedelic",
  "r-and-b-soul",
  "symphonic-metal",
] as const;

export type MusicGenre = (typeof MUSIC_GENRES)[number];

const GENRE_DISPLAY_LABELS: Record<MusicGenre, string> = {
  ambient: "Ambient",
  "art-pop": "Art Pop",
  "baroque-pop": "Baroque Pop",
  "chamber-pop": "Chamber Pop",
  classical: "Classical",
  "dream-pop": "Dream Pop",
  electronic: "Electronic",
  experimental: "Experimental",
  "hip-hop": "Hip-Hop",
  idm: "IDM",
  "indie-rock": "Indie Rock",
  industrial: "Industrial",
  jazz: "Jazz",
  "minimal-techno": "Minimal Techno",
  "neo-classical": "Neo-Classical",
  "noise-rock": "Noise Rock",
  "post-punk": "Post-Punk",
  psychedelic: "Psychedelic",
  "r-and-b-soul": "R&B / Soul",
  "symphonic-metal": "Symphonic Metal",
};

const STYLE_GENRES: Record<string, MusicGenre[]> = {
  Surrealism: ["dream-pop", "psychedelic", "art-pop", "experimental"],
  Abstract: ["electronic", "ambient", "jazz", "experimental"],
  Minimalism: ["ambient", "minimal-techno", "neo-classical", "art-pop"],
  Impressionism: ["jazz", "dream-pop", "neo-classical", "chamber-pop"],
  Expressionism: ["post-punk", "industrial", "noise-rock", "experimental"],
  Baroque: ["baroque-pop", "classical", "chamber-pop", "symphonic-metal"],
};

const CATEGORY_GENRES: Record<string, MusicGenre[]> = {
  "Graphic / Illustration / Print": ["art-pop"],
  "Mixed Media / Collage": ["experimental", "art-pop"],
  "Painterly / Illustrative": ["indie-rock"],
  "Material / Sculptural / Organic": ["ambient", "experimental"],
  "Digital / Computational": ["electronic", "idm", "experimental"],
  "Surreal / Hybrid": ["dream-pop", "psychedelic", "art-pop", "experimental"],
  "Minimal / Abstract": ["ambient", "minimal-techno", "neo-classical"],
};

function hasSignal(signals: Set<string>, ...values: string[]) {
  return values.some((value) => signals.has(value));
}

/**
 * Deterministic editorial genre classification for cover art.
 *
 * The audited visual style establishes the primary genre lane. Mood and the
 * catalog's broad visual category add adjacent lanes that make the result more
 * useful for discovery without replacing the source metadata.
 */
export function getArtworkGenres(
  artwork: Pick<Artwork, "slug" | "category" | "moodTags">,
): MusicGenre[] {
  const entry = getVisualEntry(artwork.slug);
  const style = entry?.labels.style?.label;
  const visualCategory = entry?.labels.category?.label ?? "";
  const signals = new Set([
    entry?.labels.mood?.label,
    ...artwork.moodTags,
  ].filter((value): value is string => Boolean(value)));
  const genres: MusicGenre[] = [];
  const add = (...values: MusicGenre[]) => {
    for (const value of values) {
      if (!genres.includes(value)) genres.push(value);
    }
  };

  add(...(style ? STYLE_GENRES[style] ?? [] : []));
  add(...(CATEGORY_GENRES[artwork.category] ?? []));

  if (artwork.category === "Graphic / Illustration / Print") {
    if (hasSignal(signals, "Vibrant__Energetic")) add("hip-hop");
    if (hasSignal(signals, "Melancholic__Solitary")) add("indie-rock");
  }
  if (artwork.category === "Mixed Media / Collage" && hasSignal(signals, "Vibrant__Energetic")) {
    add("hip-hop");
  }
  if (artwork.category === "Painterly / Illustrative") {
    if (hasSignal(signals, "Melancholic__Solitary")) add("jazz", "r-and-b-soul");
    if (hasSignal(signals, "Serene__Peaceful")) add("neo-classical");
  }
  if (
    artwork.category === "Material / Sculptural / Organic" &&
    (visualCategory.includes("Mechanical") || hasSignal(signals, "Eerie__Dark"))
  ) {
    add("industrial");
  }

  if (hasSignal(signals, "Mysterious__Dreamy", "dreamlike")) add("dream-pop", "ambient");
  if (hasSignal(signals, "Vibrant__Energetic")) add("art-pop", "psychedelic");
  if (hasSignal(signals, "Melancholic__Solitary")) add("jazz", "indie-rock");
  if (hasSignal(signals, "Majestic__Epic")) add("classical", "symphonic-metal");
  if (hasSignal(signals, "Eerie__Dark", "uncanny", "macabre")) add("experimental", "industrial");
  if (hasSignal(signals, "Serene__Peaceful", "quiet")) add("ambient", "neo-classical");

  if (style === "Expressionism" && hasSignal(signals, "Melancholic__Solitary")) {
    add("post-punk");
  }
  if (style === "Expressionism" && hasSignal(signals, "Eerie__Dark", "uncanny", "macabre")) {
    add("noise-rock");
  }

  return genres.length > 0 ? genres : ["experimental"];
}

export function displayGenreLabel(value: string) {
  return GENRE_DISPLAY_LABELS[value as MusicGenre] ?? value;
}

export function genreSearchTerms(artwork: Pick<Artwork, "slug" | "category" | "moodTags">) {
  return getArtworkGenres(artwork).flatMap((genre) => [genre, displayGenreLabel(genre)]);
}