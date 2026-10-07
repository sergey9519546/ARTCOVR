"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "./ProductCard";
import { GRID_RUNWAY_END, GridRunway } from "./GridRunway";
import { homepageArtworkGroups } from "@/lib/artcovr/homepage-artwork-groups";
import { orderArtworkForVisit } from "@/lib/artcovr/artwork-order-preference";
import { useArtworkOrderPreference } from "@/lib/artcovr/artwork-order-preference-context";
import { ArtworkOrderPreferenceControl } from "@/components/artcovr/ArtworkOrderPreferenceControl";

const gridArtworks = homepageArtworkGroups.grid;

const ARTWORK_IMAGE_FALLBACK = "/assets/artwork-placeholder.svg";

function hasRange(min: number, max: number) {
  return gridArtworks.length >= min && gridArtworks.length <= max;
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
  const { preference, visitIndex } = useArtworkOrderPreference();
  const remainingArtworks = useMemo(
    () =>
      orderArtworkForVisit(
        gridArtworks.slice(GRID_RUNWAY_END),
        preference,
        visitIndex,
      ),
    [preference, visitIndex],
  );

  useEffect(() => {
    const applyFallback = (image: HTMLImageElement) => {
      if (image.dataset.artworkFallback === "true") return;
      image.dataset.artworkFallback = "true";
      image.src = ARTWORK_IMAGE_FALLBACK;
    };

    const recoverAlreadyBroken = () => {
      document
        .querySelectorAll<HTMLImageElement>('a[data-artwork="true"] img')
        .forEach((image) => {
          if (image.complete && image.naturalWidth === 0) applyFallback(image);
        });
    };

    const handleImageError = (event: Event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) return;
      if (!image.closest('a[data-artwork="true"]')) return;
      applyFallback(image);
    };

    // Image `error` does not bubble, so capture it at the document. This covers
    // the grid, archive carousel and spiral with one recovery path while keeping
    // every valid private-staging image untouched.
    document.addEventListener("error", handleImageError, true);
    recoverAlreadyBroken();

    return () => document.removeEventListener("error", handleImageError, true);
  }, []);

  if (gridArtworks.length === 0) return null;
  const isPartialCatalog = hasRange(4, 7);
  const firstRow = gridArtworks.slice(0, 12);
  const uniformRowClass = "grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 md:gap-y-12 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-16";
  const firstRowSpacing = isPartialCatalog ? "mb-6 md:mb-8" : "mb-10 md:mb-12";
  const canReveal = remainingArtworks.length > CLAMPED_TRAILING_CARDS;
  // The clamp is still driven purely by "there is more to show and it is
  // currently hidden"; only the button's own mounting is decoupled from it.
  const showReveal = canReveal && !revealed;

  return (
    <section
      className="px-4 lg:px-6"
      aria-labelledby="selected-artworks"
      data-testid="homepage-artwork-grid"
    >
      <h2 id="selected-artworks" className="sr-only">
        Selected cover artwork
      </h2>

      <ArtworkOrderPreferenceControl className="mb-6 justify-end" />

      <div className={`${uniformRowClass} ${firstRowSpacing}`}>
        {firstRow.map((artwork, index) => (
          <ProductCard key={artwork.id} artwork={artwork} priority={index === 0} />
        ))}
        <GridRunway />
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

      {canReveal && (
        <div className="artwork-grid-reveal mb-16 flex justify-center md:mb-20">
          <button
            type="button"
            onClick={() => setRevealed((expanded) => !expanded)}
            aria-controls="artwork-grid-rest"
            aria-expanded={revealed}
            className="artcovr-button px-10 py-4 text-[11px] font-bold tracking-[.1em] uppercase"
          >
            {revealed
              ? "Show fewer covers"
              : `Reveal more — ${gridArtworks.length} covers`}
          </button>
        </div>
      )}
    </section>
  );
}
