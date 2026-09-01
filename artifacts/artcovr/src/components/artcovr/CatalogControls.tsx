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

export function getArtworkColor(artwork: Artwork): string | null {
  const dominantColor = getVisualEntry(artwork.slug)?.labels.domcolor?.label;
  if (dominantColor) return dominantColor;
  return artwork.accentColor ?? null;
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
  return STYLE_DISPLAY_LABELS[value] ?? displayFacetLabel(value);
}

const MOOD_DISPLAY_LABELS: Record<string, string> = {
  "Vibrant__Energetic": "Vibrant",
  "Melancholic__Solitary": "Melancholic",
  "Majestic__Epic": "Majestic",
  "Eerie__Dark": "Eerie",
  "Mysterious__Dreamy": "Mysterious",
  "Serene__Peaceful": "Serene",
};

function getArtworkMood(artwork: Artwork): string | null {
  return getVisualEntry(artwork.slug)?.labels.mood?.label ?? artwork.moodTags[0] ?? null;
}

export function displayMoodLabel(value: string) {
  return MOOD_DISPLAY_LABELS[value] ?? displayFacetLabel(value);
}

function colorSwatch(value: string) {
  if (value.startsWith("#")) return value;
  const swatches: Record<string, string> = {
    Black: "#171717",
    Blue: "#2f63c7",
    Gray: "#8a8a86",
    Green: "#3f754f",
    Orange: "#df7a2e",
    Purple: "#7953a8",
    Red: "#c84a3f",
    White: "#f5f1e7",
    Yellow: "#dfb82e",
  };
  return swatches[value];
}

export function getCatalogFacets(items: readonly Artwork[]) {
  const categories = [...new Set(items.map((item) => item.category))].sort();
  const colors = [...new Set(items.map(getArtworkColor).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => displayFacetLabel(left).localeCompare(displayFacetLabel(right)));
  const moods = [...new Set(items.map(getArtworkMood).filter((value): value is string => Boolean(value)))]
    .map((tag) => ({
      tag,
      count: items.filter((item) => getArtworkMood(item) === tag).length,
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
      if (view.category && artwork.category !== view.category) return false;
      if (view.color && getArtworkColor(artwork) !== view.color) return false;
      if (view.mood && getArtworkMood(artwork) !== view.mood) return false;
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

    const interval = window.setInterval(() => {
      setOffsets((current) => ({
        category: current.category + 3 >= facets.categories.length ? 0 : current.category + 3,
        color: current.color + 3 >= facets.colors.length ? 0 : current.color + 3,
        mood: current.mood + 3 >= facets.moods.length ? 0 : current.mood + 3,
      }));
    }, 5200);

    return () => window.clearInterval(interval);
  }, [facets.categories.length, facets.colors.length, facets.moods.length]);

  const update = (key: FacetKey, value: string | null) => {
    onChange({ ...view, [key]: value });
  };

  const rows: { key: FacetKey; label: string; options: string[]; visibleCount: number }[] = [
    { key: "category", label: "Style", options: facets.categories, visibleCount: 7 },
    { key: "mood", label: "Mood", options: facets.moods, visibleCount: 8 },
    { key: "color", label: "Color", options: facets.colors, visibleCount: 8 },
  ];

  return (
    <div className="artcovr-catalog-controls" data-catalog-controls>
      <div className="artcovr-catalog-header">
        <div>
          <p className="artcovr-catalog-heading">
            Browse the collection
          </p>
          <p className="artcovr-catalog-count" role="status" aria-live="polite">
            {resultCount} / {totalCount} works
          </p>
        </div>
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
      </div>

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