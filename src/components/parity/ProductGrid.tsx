"use client";

import { useState } from "react";
import { ProductCard } from "./ProductCard";
import { displayArtworks } from "@/lib/artcovr/artworks";

function hasRange(min: number, max: number) {
  return displayArtworks.length >= min && displayArtworks.length <= max;
}

/**
 * Cards the trailing grid shows before the reveal, at the widest breakpoint.
 * The per-breakpoint clamp itself lives in `.artwork-grid-clamp` in globals.css
 * — CSS is what knows how many columns are actually on screen. This constant
 * only decides whether the reveal button is worth rendering at all.
 */
const CLAMPED_TRAILING_CARDS = 16;

export function ProductGrid() {
  const [revealed, setRevealed] = useState(false);

  if (displayArtworks.length === 0) return null;
  const isPartialCatalog = hasRange(4, 7);
  const remainingArtworks = displayArtworks.slice(13);
  const firstRow = displayArtworks.slice(0, 13);
  const uniformRowClass = "grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-y-12 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-16";
  const firstRowSpacing = isPartialCatalog ? "mb-6 md:mb-8" : "mb-10 md:mb-12";
  const canReveal = remainingArtworks.length > CLAMPED_TRAILING_CARDS;
  const showReveal = canReveal && !revealed;

  return (
    <section className="px-4 lg:px-6" aria-labelledby="selected-artworks">
      <h2 id="selected-artworks" className="sr-only">
        Selected cover artwork
      </h2>

      <div className={`${uniformRowClass} ${firstRowSpacing}`}>
        {firstRow.map((artwork, index) => (
          <ProductCard key={artwork.id} artwork={artwork} priority={index === 0} />
        ))}
      </div>

      {remainingArtworks.length > 0 && (
        <div
          id="artwork-grid-rest"
          className={`${uniformRowClass} mb-10 md:mb-14 ${showReveal ? "artwork-grid-clamp" : ""}`}
        >
          {remainingArtworks.map((artwork) => (
            <ProductCard key={artwork.id} artwork={artwork} />
          ))}
        </div>
      )}

      {showReveal && (
        <div className="artwork-grid-reveal mb-16 flex justify-center md:mb-20">
          <button
            type="button"
            onClick={() => setRevealed(true)}
            aria-controls="artwork-grid-rest"
            aria-expanded={false}
            className="artcovr-button px-10 py-4 text-[11px] font-bold tracking-[.1em] uppercase"
          >
            Reveal more — {displayArtworks.length} covers
          </button>
        </div>
      )}
    </section>
  );
}
