"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  displayGenreLabel,
  type Artwork,
} from "@/lib/artcovr/artworks";
import {
  buildCatalogFacetIndex,
  getArtworkColors,
  getArtworkMoods,
  intersectCatalogFacetSlugs,
  type CatalogFacetIndex,
} from "@/lib/artcovr/catalog-intelligence";
import { humanizeVisualLabel } from "@/lib/artcovr/visual-index";

type FacetKey = "genre" | "color" | "mood";

export type CatalogView = {
  genre: string | null;
  color: string | null;
  mood: string | null;
};

export const DEFAULT_CATALOG_VIEW: CatalogView = {
  genre: null,
  color: null,
  mood: null,
};

export { getArtworkColors, getArtworkMoods };

export function getArtworkColor(artwork: Artwork): string | null {
  return getArtworkColors(artwork)[0] ?? null;
}

export function displayFacetLabel(value: string) {
  if (value.startsWith("#")) return value.toUpperCase();
  return humanizeVisualLabel(value);
}

const MOOD_DISPLAY_LABELS: Record<string, string> = {
  "Vibrant__Energetic": "Vibrant",
  "Melancholic__Solitary": "Melancholic",
  "Majestic__Epic": "Majestic",
  "Eerie__Dark": "Eerie",
  "Mysterious__Dreamy": "Mysterious",
  "Serene__Peaceful": "Serene",
};

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

export function getCatalogFacets(
  items: readonly Artwork[],
  index = buildCatalogFacetIndex(items),
) {
  const genres = [...index.counts.genre]
    .sort((left, right) => right[1] - left[1] || displayGenreLabel(left[0]).localeCompare(displayGenreLabel(right[0])))
    .map(([genre]) => genre);
  const colors = [...index.counts.color.keys()]
    .sort((left, right) => displayFacetLabel(left).localeCompare(displayFacetLabel(right)));
  const moods = [...index.counts.mood]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 12)
    .map(([mood]) => mood);

  return { genres, colors, moods };
}

export function applyCatalogView(
  items: readonly Artwork[],
  view: CatalogView,
  orderIndex = new Map(items.map((item, index) => [item.slug, index])),
  index = buildCatalogFacetIndex(items),
) {
  const matchingSlugs = intersectCatalogFacetSlugs(index, view);
  return [...items]
    .filter((artwork) => matchingSlugs === null || matchingSlugs.has(artwork.slug))
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
  showMoodFacet = true,
  facetIndex,
}: {
  items: Artwork[];
  view: CatalogView;
  onChange: (next: CatalogView) => void;
  onClear?: () => void;
  resultCount: number;
  totalCount: number;
  showMoodFacet?: boolean;
  facetIndex?: CatalogFacetIndex;
}) {
  const facets = useMemo(() => getCatalogFacets(items, facetIndex), [items, facetIndex]);
  const [offsets, setOffsets] = useState<Record<FacetKey, number>>({
    genre: 0,
    color: 0,
    mood: 0,
  });
  const isDefault =
    view.genre === null &&
    view.color === null &&
    view.mood === null;

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const refreshOffset = (length: number) => length > 1 ? Math.floor(Math.random() * length) : 0;
    setOffsets({
      genre: refreshOffset(facets.genres.length),
      color: refreshOffset(facets.colors.length),
      mood: refreshOffset(facets.moods.length),
    });
  }, [facets.genres.length, facets.colors.length, facets.moods.length]);

  const update = (key: FacetKey, value: string | null) => {
    onChange({ ...view, [key]: value });
  };

  const rows: { key: FacetKey; label: string; options: string[]; visibleCount: number }[] = [
    { key: "genre", label: "Genre", options: facets.genres, visibleCount: 10 },
    ...(showMoodFacet
      ? [{ key: "mood" as const, label: "Mood", options: facets.moods, visibleCount: 10 }]
      : []),
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
                      : key === "genre"
                      ? displayGenreLabel(option)
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