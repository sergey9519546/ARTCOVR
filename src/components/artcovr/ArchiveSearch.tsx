"use client";

import { useMemo, useState } from "react";
import { ArtworkGrid } from "@/components/artcovr/ArtworkGrid";
import type { Artwork } from "@/lib/artcovr/artworks";
import { searchArtworks } from "@/lib/artcovr/artworks";

export function ArchiveSearch({ items }: { items: Artwork[] }) {
  const [query, setQuery] = useState("");
  const filteredItems = useMemo(() => searchArtworks(query, items), [items, query]);

  return (
    <>
      <div className="mt-12 border-t border-current/15 pt-6 md:mt-16">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <label htmlFor="archive-search" className="text-[11px] font-bold uppercase tracking-[.12em] text-current/70">
            Search archive
          </label>
          <div className="text-xs uppercase tracking-[.12em] text-current/60">
            {filteredItems.length} / {items.length} works
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
            aria-label="Search artworks by genre, mood, color, or topic"
            className="w-full border-0 bg-transparent text-sm text-current placeholder:text-current/45 focus:outline-none"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="text-xs uppercase tracking-[.12em] text-current/70 hover:text-current">
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="border-y border-current/20 py-10 text-xl font-bold">The first approved collection is being prepared.</p>
      ) : filteredItems.length === 0 ? (
        <div className="mt-12 border border-current/20 px-6 py-12 text-center">
          <p className="text-xl font-bold">No works match that search.</p>
          <p className="mt-2 text-sm uppercase tracking-[.12em] text-current/60">Try a mood, color, category, or topic.</p>
        </div>
      ) : (
        <div className="mt-12">
          <ArtworkGrid items={filteredItems} />
        </div>
      )}
    </>
  );
}
