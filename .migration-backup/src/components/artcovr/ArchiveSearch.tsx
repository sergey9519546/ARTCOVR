"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArtworkGrid } from "@/components/artcovr/ArtworkGrid";
import type { Artwork } from "@/lib/artcovr/artworks";
import { hybridSearch } from "@/lib/artcovr/semantic-search";

type SortMode = "featured" | "price-asc" | "price-desc";

const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "price-asc", label: "Price: low to high" },
  { id: "price-desc", label: "Price: high to low" },
];

type SaleMode = Exclude<Artwork["saleMode"], null>;

const SALE_MODES: { id: SaleMode; label: string }[] = [
  { id: "exclusive", label: "Exclusive" },
  { id: "repeatable", label: "Repeatable" },
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

function isSortMode(value: string | null): value is SortMode {
  return SORT_MODES.some((mode) => mode.id === value);
}

function isSaleMode(value: string | null): value is SaleMode {
  return SALE_MODES.some((mode) => mode.id === value);
}

function isPriceBand(value: string | null): boolean {
  return PRICE_BANDS.some((band) => band.id === value);
}

export function ArchiveSearch({ items }: { items: Artwork[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [priceBand, setPriceBand] = useState<string | null>(null);
  const [saleMode, setSaleMode] = useState<SaleMode | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("featured");
  const [urlStateReady, setUrlStateReady] = useState(false);
  const initializedFromUrl = useRef(false);

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

  const hasPriceData = useMemo(
    () => items.some((item) => item.priceCents !== null),
    [items],
  );
  const availableSaleModes = useMemo(
    () => new Set(items.map((item) => item.saleMode).filter(isSaleMode)),
    [items],
  );

  // Archive controls are client-side, but their state remains shareable on the
  // statically exported page. Invalid or unavailable values fail back to the
  // unfiltered catalog instead of creating a hidden, impossible filter state.
  useEffect(() => {
    if (initializedFromUrl.current) return;
    initializedFromUrl.current = true;

    const params = new URLSearchParams(window.location.search);
    const nextCategory = params.get("category");
    const nextMood = params.get("mood");
    const nextPriceBand = params.get("price");
    const nextSaleMode = params.get("sale");
    const nextSort = params.get("sort");

    setQuery((params.get("q") ?? "").trim().slice(0, 160));
    setCategory(nextCategory && categories.includes(nextCategory) ? nextCategory : null);
    setMood(nextMood && moods.includes(nextMood) ? nextMood : null);
    setPriceBand(hasPriceData && isPriceBand(nextPriceBand) ? nextPriceBand : null);
    setSaleMode(
      isSaleMode(nextSaleMode) && availableSaleModes.has(nextSaleMode)
        ? nextSaleMode
        : null,
    );
    setSort(isSortMode(nextSort) ? nextSort : "featured");
    setUrlStateReady(true);
  }, [availableSaleModes, categories, hasPriceData, moods]);

  useEffect(() => {
    if (!urlStateReady) return;

    const url = new URL(window.location.href);
    const setParam = (name: string, value: string | null) => {
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    };

    setParam("q", query.trim() || null);
    setParam("category", category);
    setParam("price", priceBand);
    setParam("sale", saleMode);
    setParam("mood", mood);
    setParam("sort", sort === "featured" ? null : sort);

    const nextLocation = `${url.pathname}${url.search}${url.hash}`;
    const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextLocation !== currentLocation) {
      window.history.replaceState(window.history.state, "", nextLocation);
    }
  }, [category, mood, priceBand, query, saleMode, sort, urlStateReady]);

  const filteredItems = useMemo(() => {
    const textMatched = hybridSearch(query, items);
    const matched = textMatched.filter((art) => {
      if (category && art.category !== category) return false;
      if (priceBand && priceBandOf(art) !== priceBand) return false;
      if (saleMode && art.saleMode !== saleMode) return false;
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
  }, [items, query, category, priceBand, saleMode, mood, sort, orderIndex]);

  const selectedPriceBand = PRICE_BANDS.find((band) => band.id === priceBand);
  const selectedSaleMode = SALE_MODES.find((mode) => mode.id === saleMode);
  const selectedSort = SORT_MODES.find((mode) => mode.id === sort);
  const activeFilterLabels = [
    query.trim() ? `Search: “${query.trim()}”` : null,
    category ? `Category: ${category}` : null,
    selectedPriceBand ? `Price: ${selectedPriceBand.label}` : null,
    selectedSaleMode ? `Sale mode: ${selectedSaleMode.label}` : null,
    mood ? `Mood: ${mood}` : null,
    sort !== "featured" && selectedSort ? `Sort: ${selectedSort.label}` : null,
  ].filter((label): label is string => label !== null);
  const hasActiveControls = activeFilterLabels.length > 0;
  const clearAll = () => {
    setQuery("");
    setCategory(null);
    setPriceBand(null);
    setSaleMode(null);
    setMood(null);
    setSort("featured");
  };

  return (
    <>
      <div className="mt-12 border-t border-current/15 pt-6 md:mt-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <label htmlFor="archive-search" className="text-xs font-bold uppercase tracking-[.12em] text-current/80">
            Search archive
          </label>
          <div className="min-w-0 max-w-2xl break-words text-left text-xs uppercase tracking-[.08em] text-current/80 md:text-right">
            <div id="archive-results-summary" role="status" aria-live="polite" aria-atomic="true">
              <p>
                Showing {filteredItems.length} of {items.length} {items.length === 1 ? "work" : "works"}.
              </p>
              <p className="mt-1 normal-case tracking-normal">
                {hasActiveControls ? `Active: ${activeFilterLabels.join(" · ")}` : "No filters applied."}
              </p>
            </div>
            {hasActiveControls ? (
              <button
                type="button"
                onClick={clearAll}
                aria-controls="archive-results"
                className="mt-2 min-h-8 font-bold underline underline-offset-4 hover:text-current"
              >
                Clear filters and sort
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-full border border-current/50 bg-transparent px-4 py-3 text-base focus-within:border-current focus-within:ring-2 focus-within:ring-current focus-within:ring-offset-2 focus-within:ring-offset-[var(--background)] md:max-w-xl">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0 opacity-70">
            <path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.8l4.4 4.4 1.4-1.4-4.4-4.4A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" fill="currentColor"/>
          </svg>
          <input
            id="archive-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={160}
            aria-controls="archive-results"
            aria-describedby="archive-results-summary"
            placeholder="Search genre, mood, color, topic..."
            className="min-w-0 w-full border-0 bg-transparent text-sm text-current placeholder:text-current/70 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-controls="archive-results"
              className="min-h-8 text-xs font-bold uppercase tracking-[.12em] text-current/80 hover:text-current"
            >
              Clear search
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

          {hasPriceData ? (
            <FilterRow label="Price">
              <Chip active={priceBand === null} onClick={() => setPriceBand(null)}>Any</Chip>
              {PRICE_BANDS.map((band) => (
                <Chip key={band.id} active={priceBand === band.id} onClick={() => setPriceBand(band.id)}>
                  {band.label}
                </Chip>
              ))}
            </FilterRow>
          ) : null}

          {availableSaleModes.size > 0 ? (
            <FilterRow label="Sale mode">
              <Chip active={saleMode === null} onClick={() => setSaleMode(null)}>Any</Chip>
              {SALE_MODES.filter((mode) => availableSaleModes.has(mode.id)).map((mode) => (
                <Chip key={mode.id} active={saleMode === mode.id} onClick={() => setSaleMode(mode.id)}>
                  {mode.label}
                </Chip>
              ))}
            </FilterRow>
          ) : null}

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

      <div id="archive-results">
        {items.length === 0 ? (
          <p className="border-y border-current/20 py-10 text-xl font-bold">The first approved collection is being prepared.</p>
        ) : filteredItems.length === 0 ? (
          <div className="mt-12 border border-current/50 px-6 py-12 text-center">
            <p className="text-xl font-bold">No works match those filters.</p>
            <p className="mt-2 text-sm uppercase tracking-[.1em] text-current/80">Try a different mood, category, sale mode, or price.</p>
          </div>
        ) : (
          <div className="mt-12">
            <ArtworkGrid items={filteredItems} />
          </div>
        )}
      </div>
    </>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <span aria-hidden="true" className="w-24 shrink-0 text-xs font-bold uppercase tracking-[.12em] text-current/80">
          {label}
        </span>
        <div className="flex flex-wrap gap-2">{children}</div>
      </div>
    </fieldset>
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
      aria-controls="archive-results"
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[.08em] transition-colors ${
        active
          ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
          : "border-current/50 text-current/80 hover:border-current hover:text-current"
      }`}
    >
      {active ? <span aria-hidden="true">✓</span> : null}
      {children}
    </button>
  );
}
