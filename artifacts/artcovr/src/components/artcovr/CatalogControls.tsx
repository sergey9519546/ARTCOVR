"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Artwork } from "@/lib/artcovr/artworks";
import { getVisualEntry, humanizeVisualLabel } from "@/lib/artcovr/visual-index";

type FacetKey = "category" | "color" | "mood";

export type CatalogView = {
  category: string | null;
  color: string | null;
  mood: string | null;
};

export const DEFAULT_CATALOG_VIEW: CatalogView = {
  category: null,
  color: null,
  mood: null,
};

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

export function getArtworkColor(artwork: Artwork): string | null {
  return getArtworkColors(artwork)[0] ?? null;
}

export function displayFacetLabel(value: string) {
  if (value.startsWith("#")) return value.toUpperCase();
  return humanizeVisualLabel(value);
}

const STYLE_DISPLAY_LABELS: Record<string, string> = {
  "Digital / Computational": "Digital",
  "Graphic / Illustration / Print": "Graphic",
  "Material / Sculptural / Organic": "Sculptural",
  "Minimal / Abstract": "Minimal",
  "Mixed Media / Collage": "Collage",
  "Painterly / Illustrative": "Painterly",
  "Surreal / Hybrid": "Surreal",
};

export function displayStyleLabel(value: string) {
  return STYLE_DISPLAY_LABELS[value] ?? VISUAL_STYLE_DISPLAY_LABELS[value] ?? displayFacetLabel(value);
}

const VISUAL_STYLE_DISPLAY_LABELS: Record<string, string> = {
  Surrealism: "Surrealist",
  Abstract: "Abstract",
  Minimalism: "Minimalist",
  Impressionism: "Impressionist",
  Expressionism: "Expressionist",
  Baroque: "Baroque",
};

function getArtworkStyles(artwork: Artwork): string[] {
  const visualStyle = getVisualEntry(artwork.slug)?.labels.style?.label;
  return [...new Set([artwork.category, visualStyle].filter((value): value is string => Boolean(value)))];
}

const MOOD_DISPLAY_LABELS: Record<string, string> = {
  "Vibrant__Energetic": "Vibrant",
  "Melancholic__Solitary": "Melancholic",
  "Majestic__Epic": "Majestic",
  "Eerie__Dark": "Eerie",
  "Mysterious__Dreamy": "Mysterious",
  "Serene__Peaceful": "Serene",
};

const EMOTIONAL_MOOD_TAGS = new Set([
  "dreamlike",
  "quiet",
  "monumental",
  "solitary",
  "nocturnal",
  "uncanny",
  "macabre",
]);

function getArtworkMoods(artwork: Artwork): string[] {
  const visualMood = getVisualEntry(artwork.slug)?.labels.mood?.label;
  const taggedMoods = artwork.moodTags.filter((tag) => EMOTIONAL_MOOD_TAGS.has(tag));
  return [...new Set([visualMood, ...taggedMoods].filter((value): value is string => Boolean(value)))];
}

export function displayMoodLabel(value: string) {
  return MOOD_DISPLAY_LABELS[value] ?? displayFacetLabel(value);
}

function colorSwatch(value: string) {
  if (value.startsWith("#")) return value;
  const swatches: Record<string, string> = {
    Black: "#171717",
    Blue: "#2f63c7",
    Brown: "#8a5a3b",
    Gray: "#8a8a86",
    Green: "#3f754f",
    Orange: "#df7a2e",
    Pink: "#d88b9c",
    Purple: "#7953a8",
    Red: "#c84a3f",
    Teal: "#319b95",
    White: "#f5f1e7",
    Yellow: "#dfb82e",
  };
  return swatches[value];
}

export function getCatalogFacets(items: readonly Artwork[]) {
  const categories = [...new Set(items.flatMap(getArtworkStyles))]
    .sort((left, right) => displayStyleLabel(left).localeCompare(displayStyleLabel(right)));
  const colors = [...new Set(items.flatMap(getArtworkColors))]
    .sort((left, right) => displayFacetLabel(left).localeCompare(displayFacetLabel(right)));
  const moods = [...new Set(items.flatMap(getArtworkMoods))]
    .map((tag) => ({
      tag,
      count: items.filter((item) => getArtworkMoods(item).includes(tag)).length,
    }))
    .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
    .slice(0, 12)
    .map(({ tag }) => tag);

  return { categories, colors, moods };
}

export function applyCatalogView(
  items: readonly Artwork[],
  view: CatalogView,
  orderIndex = new Map(items.map((item, index) => [item.slug, index])),
) {
  return [...items]
    .filter((artwork) => {
      if (view.category && !getArtworkStyles(artwork).includes(view.category)) return false;
      if (view.color && !getArtworkColors(artwork).includes(view.color)) return false;
      if (view.mood && !getArtworkMoods(artwork).includes(view.mood)) return false;
      return true;
    })
    .sort((left, right) => (orderIndex.get(left.slug) ?? 0) - (orderIndex.get(right.slug) ?? 0));
}

function getVisibleFacetValues(
  options: string[],
  active: string | null,
  offset: number,
  visibleCount: number,
) {
  const rotatingOptions = active ? options.filter((option) => option !== active) : options;
  const rotatingCount = active ? visibleCount - 1 : visibleCount;
  if (rotatingOptions.length <= rotatingCount) {
    return active ? [active, ...rotatingOptions] : rotatingOptions;
  }

  const start = offset % rotatingOptions.length;
  const visible = Array.from({ length: rotatingCount }, (_, index) => (
    rotatingOptions[(start + index) % rotatingOptions.length]
  ));
  return active ? [active, ...visible] : visible;
}

export function CatalogControls({
  items,
  view,
  onChange,
  onClear,
  resultCount,
  totalCount,
}: {
  items: Artwork[];
  view: CatalogView;
  onChange: (next: CatalogView) => void;
  onClear?: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const facets = useMemo(() => getCatalogFacets(items), [items]);
  const [offsets, setOffsets] = useState<Record<FacetKey, number>>({
    category: 0,
    color: 0,
    mood: 0,
  });
  const isDefault =
    view.category === null &&
    view.color === null &&
    view.mood === null;

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const refreshOffset = (length: number) => length > 1 ? Math.floor(Math.random() * length) : 0;
    setOffsets({
      category: refreshOffset(facets.categories.length),
      color: refreshOffset(facets.colors.length),
      mood: refreshOffset(facets.moods.length),
    });
  }, [facets.categories.length, facets.colors.length, facets.moods.length]);

  const update = (key: FacetKey, value: string | null) => {
    onChange({ ...view, [key]: value });
  };

  const rows: { key: FacetKey; label: string; options: string[]; visibleCount: number }[] = [
    { key: "category", label: "Style", options: facets.categories, visibleCount: 10 },
    { key: "mood", label: "Mood", options: facets.moods, visibleCount: 10 },
    { key: "color", label: "Color", options: facets.colors, visibleCount: 12 },
  ];

  return (
    <div className="artcovr-catalog-controls" data-catalog-controls data-compact="true">
      <p className="sr-only" role="status" aria-live="polite">
        {resultCount} / {totalCount} works
      </p>
      {!isDefault ? (
        <button
          type="button"
          onClick={() => {
            if (onClear) onClear();
            else onChange(DEFAULT_CATALOG_VIEW);
          }}
          className="artcovr-catalog-clear"
        >
          Clear all
        </button>
      ) : null}
      <div className="artcovr-catalog-facets">
        {rows.map(({ key, label, options, visibleCount }) => {
          const visibleOptions = getVisibleFacetValues(options, view[key], offsets[key], visibleCount);
          const headingId = `catalog-facet-${key}`;
          return (
            <section className="artcovr-catalog-facet" data-facet={key} key={key} aria-labelledby={headingId}>
              <header className="artcovr-catalog-facet-head">
                <h3 id={headingId}>{label}</h3>
              </header>
              <div className="artcovr-catalog-facet-choices">
                <Chip active={view[key] === null} onClick={() => update(key, null)}>All</Chip>
              {visibleOptions.map((option) => (
                <Chip
                  key={option}
                  active={view[key] === option}
                  onClick={() => update(key, option)}
                  swatch={key === "color" ? colorSwatch(option) : undefined}
                  swatchOnly={key === "color"}
                  ariaLabel={key === "color" ? `Color: ${displayFacetLabel(option)}` : undefined}
                >
                  {key === "color"
                    ? null
                    : key === "category"
                      ? displayStyleLabel(option)
                      : displayMoodLabel(option)}
                </Chip>
              ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  swatch,
  children,
  swatchOnly,
  ariaLabel,
}: {
  active: boolean;
  onClick: () => void;
  swatch?: string;
  swatchOnly?: boolean;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      data-active={active || undefined}
      data-swatch-only={swatchOnly || undefined}
      className="artcovr-filter-control"
    >
      {swatch ? (
        <span
          aria-hidden="true"
          className="artcovr-filter-swatch"
          style={{ background: swatch }}
        />
      ) : null}
      {children}
    </button>
  );
}