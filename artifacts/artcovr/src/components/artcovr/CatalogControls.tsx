"use client";

import { useMemo, type ReactNode } from "react";
import type { Artwork } from "@/lib/artcovr/artworks";
import { getVisualEntry, humanizeVisualLabel } from "@/lib/artcovr/visual-index";

export type CatalogSort = "curated" | "title-asc" | "price-asc" | "price-desc";
export type CatalogGroup = "none" | "category" | "color" | "mood";

export type CatalogView = {
  category: string | null;
  color: string | null;
  mood: string | null;
  priceBand: string | null;
  sort: CatalogSort;
  group: CatalogGroup;
};

export const DEFAULT_CATALOG_VIEW: CatalogView = {
  category: null,
  color: null,
  mood: null,
  priceBand: null,
  sort: "curated",
  group: "none",
};

export const PRICE_BANDS = [
  { id: "under-50", label: "Under $50", min: 0, max: 5000 },
  { id: "50-100", label: "$50–$100", min: 5000, max: 10000 },
  { id: "100-200", label: "$100–$200", min: 10000, max: 20000 },
  { id: "200-plus", label: "$200+", min: 20000, max: Infinity },
] as const;

export const SORT_MODES: { id: CatalogSort; label: string }[] = [
  { id: "curated", label: "Curated" },
  { id: "title-asc", label: "A–Z" },
  { id: "price-asc", label: "Price ↑" },
  { id: "price-desc", label: "Price ↓" },
];

export const GROUP_MODES: { id: CatalogGroup; label: string }[] = [
  { id: "none", label: "No grouping" },
  { id: "category", label: "Category" },
  { id: "color", label: "Color" },
  { id: "mood", label: "Mood" },
];

export function getArtworkColor(artwork: Artwork): string | null {
  const dominantColor = getVisualEntry(artwork.slug)?.labels.domcolor?.label;
  if (dominantColor) return dominantColor;
  return artwork.accentColor ?? null;
}

export function displayFacetLabel(value: string) {
  if (value.startsWith("#")) return value.toUpperCase();
  return humanizeVisualLabel(value);
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

export function priceBandOf(artwork: Artwork): string | null {
  if (artwork.priceCents === null) return null;
  const band = PRICE_BANDS.find(
    (candidate) =>
      artwork.priceCents !== null &&
      artwork.priceCents >= candidate.min &&
      artwork.priceCents < candidate.max,
  );
  return band?.id ?? null;
}

export function getCatalogFacets(items: readonly Artwork[]) {
  const categories = [...new Set(items.map((item) => item.category))].sort();
  const colors = [...new Set(items.map(getArtworkColor).filter((value): value is string => Boolean(value)))]
    .sort((left, right) => displayFacetLabel(left).localeCompare(displayFacetLabel(right)));
  const moods = [...new Set(items.flatMap((item) => item.moodTags))]
    .map((tag) => ({
      tag,
      count: items.filter((item) => item.moodTags.includes(tag)).length,
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
  const matched = items.filter((artwork) => {
    if (view.category && artwork.category !== view.category) return false;
    if (view.color && getArtworkColor(artwork) !== view.color) return false;
    if (view.mood && !artwork.moodTags.includes(view.mood)) return false;
    if (view.priceBand && priceBandOf(artwork) !== view.priceBand) return false;
    return true;
  });

  return [...matched].sort((left, right) => {
    if (view.sort === "title-asc") return left.title.localeCompare(right.title);
    if (view.sort === "price-asc") {
      return (left.priceCents ?? Infinity) - (right.priceCents ?? Infinity);
    }
    if (view.sort === "price-desc") {
      return (right.priceCents ?? -Infinity) - (left.priceCents ?? -Infinity);
    }
    return (orderIndex.get(left.slug) ?? 0) - (orderIndex.get(right.slug) ?? 0);
  });
}

export function groupArtworks(items: readonly Artwork[], group: CatalogGroup) {
  if (group === "none") return [{ key: "all", label: null, items: [...items] }];

  const buckets = new Map<string, Artwork[]>();
  for (const artwork of items) {
    const key =
      group === "category"
        ? artwork.category
        : group === "color"
          ? getArtworkColor(artwork) ?? "Unclassified"
          : artwork.moodTags[0] ?? "Unclassified";
    buckets.set(key, [...(buckets.get(key) ?? []), artwork]);
  }

  return [...buckets.entries()].map(([key, groupedItems]) => ({
    key,
    label: displayFacetLabel(key),
    items: groupedItems,
  }));
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
  const hasPriceData = items.some((item) => item.priceCents !== null);
  const activeFilters = [
    view.category,
    view.color,
    view.mood,
    view.priceBand,
  ].filter(Boolean).length;
  const isDefault =
    activeFilters === 0 && view.sort === "curated" && view.group === "none";

  const update = <Key extends keyof CatalogView>(key: Key, value: CatalogView[Key]) => {
    onChange({ ...view, [key]: value });
  };

  return (
    <div className="border-y border-current/15 py-5" data-catalog-controls>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.12em] text-current/60">
            Browse the collection
          </p>
          <p className="mt-1 text-xs uppercase tracking-[.1em] text-current/50" role="status" aria-live="polite">
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
            className="text-[11px] font-bold uppercase tracking-[.1em] underline underline-offset-4 hover:text-current"
          >
            Clear all
          </button>
        ) : null}
      </div>

      <div className="mt-5 space-y-4">
        <ControlRow label="Category">
          <Chip active={view.category === null} onClick={() => update("category", null)}>All</Chip>
          {facets.categories.map((category) => (
            <Chip key={category} active={view.category === category} onClick={() => update("category", category)}>
              {category}
            </Chip>
          ))}
        </ControlRow>

        <ControlRow label="Color">
          <Chip active={view.color === null} onClick={() => update("color", null)}>All</Chip>
          {facets.colors.map((color) => (
            <Chip
              key={color}
              active={view.color === color}
              onClick={() => update("color", color)}
              swatch={colorSwatch(color)}
            >
              {displayFacetLabel(color)}
            </Chip>
          ))}
        </ControlRow>

        <ControlRow label="Mood">
          <Chip active={view.mood === null} onClick={() => update("mood", null)}>All</Chip>
          {facets.moods.map((mood) => (
            <Chip key={mood} active={view.mood === mood} onClick={() => update("mood", mood)}>
              {mood}
            </Chip>
          ))}
        </ControlRow>

        <ControlRow label="Price">
          <Chip active={view.priceBand === null} onClick={() => update("priceBand", null)}>Any</Chip>
          {PRICE_BANDS.map((band) => (
            <Chip key={band.id} active={view.priceBand === band.id} onClick={() => update("priceBand", band.id)}>
              {band.label}
            </Chip>
          ))}
        </ControlRow>

        <ControlRow label="Sort">
          {SORT_MODES.map((mode) => (
            <Chip
              key={mode.id}
              active={view.sort === mode.id}
              disabled={!hasPriceData && mode.id.startsWith("price")}
              onClick={() => update("sort", mode.id)}
            >
              {mode.label}
            </Chip>
          ))}
        </ControlRow>

        <ControlRow label="Group">
          {GROUP_MODES.map((mode) => (
            <Chip key={mode.id} active={view.group === mode.id} onClick={() => update("group", mode.id)}>
              {mode.label}
            </Chip>
          ))}
        </ControlRow>
      </div>
    </div>
  );
}

function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-start">
      <span className="w-20 shrink-0 pt-2 text-[11px] font-bold uppercase tracking-[.12em] text-current/50">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  disabled = false,
  onClick,
  swatch,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  swatch?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      data-active={active || undefined}
      className="artcovr-filter-control"
    >
      {swatch ? (
        <span
          aria-hidden="true"
          className="artcovr-filter-swatch"
          style={{ backgroundColor: swatch }}
        />
      ) : null}
      {children}
    </button>
  );
}