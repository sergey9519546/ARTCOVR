"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArtworkGrid } from "@/components/artcovr/ArtworkGrid";
import type { Artwork } from "@/lib/artcovr/artworks";
import { searchArtworks } from "@/lib/artcovr/artworks";

type SortMode = "featured" | "price-asc" | "price-desc";

const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price ↑" },
  { id: "price-desc", label: "Price ↓" },
];

type PriceBand = { id: string; label: string; min: number; max: number };

const PRICE_BANDS: PriceBand[] = [
  { id: "under-50", label: "Under $50", min: 0, max: 5000 },
  { id: "50-100", label: "$50–$100", min: 5000, max: 10000 },
  { id: "100-200", label: "$100–$200", min: 10000, max: 20000 },
  { id: "200-plus", label: "$200+", min: 20000, max: Infinity },
];

function priceBandOf(art: Artwork): string | null {
  if (art.priceCents === null) return null;
  const band = PRICE_BANDS.find(
    (b) => art.priceCents !== null && art.priceCents >= b.min && art.priceCents < b.max,
  );
  return band ? band.id : null;
}

export function ArchiveSearch({ items }: { items: Artwork[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [priceBand, setPriceBand] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("featured");

  // Preserve the curated display order so "Featured" sort restores the
  // owner-pick + palette-spread arrangement after filtering.
  const orderIndex = useMemo(
    () => new Map(items.map((item, index) => [item.slug, index])),
    [items],
  );

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category))].sort(),
    [items],
  );
  const moods = useMemo(
    () =>
      [...new Set(items.flatMap((i) => i.moodTags))]
        .map((tag) => ({ tag, count: items.filter((i) => i.moodTags.includes(tag)).length }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12)
        .map((entry) => entry.tag),
    [items],
  );

  const filteredItems = useMemo(() => {
    const textMatched = searchArtworks(query, items);
    const matched = textMatched.filter((art) => {
      if (category && art.category !== category) return false;
      if (priceBand && priceBandOf(art) !== priceBand) return false;
      if (mood && !art.moodTags.includes(mood)) return false;
      return true;
    });

    const sorted = [...matched];
    if (sort === "price-asc") {
      sorted.sort((left, right) => (left.priceCents ?? Infinity) - (right.priceCents ?? Infinity));
    } else if (sort === "price-desc") {
      sorted.sort((left, right) => (right.priceCents ?? -Infinity) - (left.priceCents ?? -Infinity));
    } else {
      sorted.sort(
        (left, right) =>
          (orderIndex.get(left.slug) ?? 0) - (orderIndex.get(right.slug) ?? 0),
      );
    }
    return sorted;
  }, [items, query, category, priceBand, mood, sort, orderIndex]);

  const hasPriceData = useMemo(
    () => items.some((item) => item.priceCents !== null),
    [items],
  );

  const activeFilters = [category, priceBand, mood].filter(Boolean).length;
  const clearAll = () => {
    setQuery("");
    setCategory(null);
    setPriceBand(null);
    setMood(null);
    setSort("featured");
  };

  return (
    <>
      <div className="mt-12 border-t border-current/15 pt-6 md:mt-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <label htmlFor="archive-search" className="text-[11px] font-bold uppercase tracking-[.12em] text-current/70">
            Search archive
          </label>
          <div className="text-xs uppercase tracking-[.12em] text-current/60" role="status" aria-live="polite">
            {filteredItems.length} / {items.length} works
            {activeFilters > 0 ? (
              <button type="button" onClick={clearAll} className="ml-3 underline hover:text-current">
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-full border border-current/20 bg-transparent px-4 py-3 text-base md:max-w-xl">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 opacity-70">
            <path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.8l4.4 4.4 1.4-1.4-4.4-4.4A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" fill="currentColor"/>
          </svg>
          <input
            id="archive-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search genre, mood, color, topic..."
            className="w-full border-0 bg-transparent text-sm text-current placeholder:text-current/45 focus:outline-none"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="text-xs uppercase tracking-[.12em] text-current/70 hover:text-current">
              Clear
            </button>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-5">
          <FilterRow label="Category">
            <Chip active={category === null} onClick={() => setCategory(null)}>All</Chip>
            {categories.map((cat) => (
              <Chip key={cat} active={category === cat} onClick={() => setCategory(cat)}>
                {cat}
              </Chip>
            ))}
          </FilterRow>

          <FilterRow label="Price">
            <Chip active={priceBand === null} onClick={() => setPriceBand(null)}>Any</Chip>
            {PRICE_BANDS.map((band) => (
              <Chip key={band.id} active={priceBand === band.id} onClick={() => setPriceBand(band.id)}>
                {band.label}
              </Chip>
            ))}
          </FilterRow>

          <FilterRow label="Mood">
            <Chip active={mood === null} onClick={() => setMood(null)}>Any</Chip>
            {moods.map((tag) => (
              <Chip key={tag} active={mood === tag} onClick={() => setMood(tag)}>
                {tag}
              </Chip>
            ))}
          </FilterRow>

          {hasPriceData ? (
            <FilterRow label="Sort">
              {SORT_MODES.map((mode) => (
                <Chip key={mode.id} active={sort === mode.id} onClick={() => setSort(mode.id)}>
                  {mode.label}
                </Chip>
              ))}
            </FilterRow>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="border-y border-current/20 py-10 text-xl font-bold">The first approved collection is being prepared.</p>
      ) : filteredItems.length === 0 ? (
        <div className="mt-12 border border-current/20 px-6 py-12 text-center">
          <p className="text-xl font-bold">No works match those filters.</p>
          <p className="mt-2 text-sm uppercase tracking-[.12em] text-current/60">Try a different mood, category, or price.</p>
        </div>
      ) : (
        <div className="mt-12">
          <ArtworkGrid items={filteredItems} />
        </div>
      )}
    </>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <span className="w-20 shrink-0 text-[11px] font-bold uppercase tracking-[.12em] text-current/50">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[.08em] transition-colors ${
        active
          ? "border-current bg-current text-[var(--background)]"
          : "border-current/20 text-current/70 hover:border-current/50 hover:text-current"
      }`}
    >
      {children}
    </button>
  );
}
