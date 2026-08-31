"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { featuredArtworks } from "@/lib/artcovr/artworks";
import { STATIC_MEDIA_QUERY } from "@/lib/artcovr/motion";
import { ProductCard } from "./ProductCard";

export const GRID_RUNWAY_END = 17;
const RUNWAY_ITEMS = featuredArtworks.slice(12, GRID_RUNWAY_END);

/**
 * This is an ordinary product-grid row on a horizontal rail. Card dimensions,
 * metadata and column gaps stay identical to the surrounding catalog; scroll
 * changes only the rail's x position, and reversing scroll reverses the rail.
 */
export function GridRunway() {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const track = trackRef.current;
    if (!root || !track || RUNWAY_ITEMS.length < 2) return;

    gsap.registerPlugin(ScrollTrigger);
    const mediaQuery = window.matchMedia(STATIC_MEDIA_QUERY);
    let context: gsap.Context | null = null;
    const syncMotion = () => {
      context?.revert();
      context = null;
      delete root.dataset.runwayMotion;
      if (mediaQuery.matches) return;

      root.dataset.runwayMotion = "true";

      context = gsap.context(() => {
        gsap.fromTo(
          track,
          { x: 0 },
          {
            x: () => -Math.max(0, track.scrollWidth - root.clientWidth),
            ease: "none",
            scrollTrigger: {
              trigger: root,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.8,
              invalidateOnRefresh: true,
            },
          },
        );
      }, root);
    };
    syncMotion();
    mediaQuery.addEventListener("change", syncMotion);

    return () => {
      mediaQuery.removeEventListener("change", syncMotion);
      context?.revert();
      delete root.dataset.runwayMotion;
    };
  }, []);

  if (RUNWAY_ITEMS.length < 2) return null;

  return (
    <div
      ref={rootRef}
      data-artwork-runway
      className="relative col-span-full overflow-x-auto data-[runway-motion=true]:overflow-hidden"
    >
      <div
        ref={trackRef}
        data-runway-track
        className="grid w-full grid-flow-col auto-cols-[calc((100%_-_1rem)/2)] gap-x-4 will-change-transform md:auto-cols-[calc((100%_-_2rem)/3)] lg:auto-cols-[calc((100%_-_4.5rem)/4)] lg:gap-x-6"
      >
        {RUNWAY_ITEMS.map((artwork) => (
          <ProductCard key={artwork.id} artwork={artwork} />
        ))}
      </div>
    </div>
  );
}
