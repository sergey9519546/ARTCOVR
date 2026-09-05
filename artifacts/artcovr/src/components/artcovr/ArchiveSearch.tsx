"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/compat/Link";
import { ArtworkGrid } from "@/components/artcovr/ArtworkGrid";
import {
  applyCatalogView,
  CatalogControls,
  DEFAULT_CATALOG_VIEW,
  type CatalogView,
} from "@/components/artcovr/CatalogControls";
import type { Artwork } from "@/lib/artcovr/artworks";
import { hybridSearch } from "@/lib/artcovr/semantic-search";
import { buildCatalogFacetIndex } from "@/lib/artcovr/catalog-intelligence";
import { trackEvent } from "@/lib/artcovr/analytics";

export function ArchiveSearch({ items }: { items: Artwork[] }) {
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("query") ?? "";
  });
  const [view, setView] = useState<CatalogView>(() => {
    if (typeof window === "undefined") return DEFAULT_CATALOG_VIEW;
    const params = new URLSearchParams(window.location.search);
    return {
      genre: params.get("genre") || null,
      color: params.get("color") || null,
      mood: null,
    };
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    const nextParams: Array<[string, string | null]> = [
      ["query", query.trim() || null],
      ["genre", view.genre],
      ["color", view.color],
    ];
    for (const [key, value] of nextParams) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    url.searchParams.delete("mood");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [query, view]);

  // Preserve the curated display order so "Featured" sort restores the
  // owner-pick + palette-spread arrangement after filtering.
  const orderIndex = useMemo(
    () => new Map(items.map((item, index) => [item.slug, index])),
    [items],
  );
  const facetIndex = useMemo(() => buildCatalogFacetIndex(items), [items]);

  const filteredItems = useMemo(() => {
    const textMatched = hybridSearch(query, items);
    return applyCatalogView(textMatched, view, orderIndex, facetIndex);
  }, [items, query, view, orderIndex, facetIndex]);
  const hasActiveSearch = query.length > 0 || Object.values(view).some(Boolean);

  useEffect(() => {
    if (!hasActiveSearch) return;
    const timer = window.setTimeout(() => {
      trackEvent("archive_filtered", {
        query_length: query.trim().length,
        genre: view.genre ?? "all",
        color: view.color ?? "all",
        result_count: filteredItems.length,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [filteredItems.length, hasActiveSearch, query, view.color, view.genre]);

  return (
    <>
      <div className="mt-12 border-t border-current/15 pt-6 md:mt-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <label htmlFor="archive-search" className="text-[11px] font-bold uppercase tracking-[.12em] text-current/70">
            Search archive
          </label>
          <div className="flex items-center gap-5">
            <p className="text-[11px] font-bold uppercase tracking-[.1em] text-[var(--muted-foreground)]" role="status" aria-live="polite">
              {filteredItems.length} / {items.length} works
            </p>
            {hasActiveSearch ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setView(DEFAULT_CATALOG_VIEW);
                }}
                className="text-[11px] font-bold uppercase tracking-[.1em] underline underline-offset-4 text-current/70 hover:text-current"
              >
                Clear all
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

        <CatalogControls
          items={items}
          view={view}
          onChange={setView}
          onClear={() => {
            setQuery("");
            setView(DEFAULT_CATALOG_VIEW);
          }}
          resultCount={filteredItems.length}
          totalCount={items.length}
          showMoodFacet={false}
          facetIndex={facetIndex}
        />
      </div>

      {items.length === 0 ? (
        <section className="border-y border-current/20 py-10" aria-label="Archive is empty">
          <p className="text-xl font-bold">The first approved collection is being prepared.</p>
          <Link href="/" className="link-hover mt-5 inline-flex min-h-11 items-center text-xs font-bold uppercase tracking-[.08em]">
            Return home
          </Link>
        </section>
      ) : filteredItems.length === 0 ? (
        <section className="mt-12 border border-current/20 px-6 py-12 text-center" aria-label="No matching artwork">
          <p className="text-xl font-bold">No works match those filters.</p>
            <p className="mx-auto mt-2 max-w-[48ch] text-sm leading-6 text-current/60">Try a different genre, color, mood, or visual topic, or clear the current search to browse the full archive.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setView(DEFAULT_CATALOG_VIEW);
              }}
              className="artcovr-button mt-6 min-h-11 px-5 py-3 text-xs font-bold uppercase tracking-[.08em]"
            >
              Clear filters
            </button>
         </section>
      ) : (
        <div className="mt-12">
          <ArtworkGrid items={filteredItems} />
        </div>
      )}
    </>
  );
}
